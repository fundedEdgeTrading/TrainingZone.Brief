import { prisma } from "@/lib/prisma";
import type { ServiceKind } from "@prisma/client";
import { createNotificationOnce } from "@/lib/notifications";
import { getMemberServiceKinds } from "@/lib/members-queries";

const SERVICE_KINDS: ServiceKind[] = ["GROUP", "PERSONAL_TRAINING", "ONLINE"];
const KIND_MAP: Record<"GROUP" | "EP" | "ONLINE", ServiceKind> = { GROUP: "GROUP", EP: "PERSONAL_TRAINING", ONLINE: "ONLINE" };

/** Intervalos configurables por org x tipo de servicio (decisión §11.6), con defaults al vuelo. */
export async function getCheckinConfigs(orgId: string) {
  const existing = await prisma.checkinScheduleConfig.findMany({ where: { orgId } });
  const byKind = new Map(existing.map((c) => [c.serviceKind, c]));
  return SERVICE_KINDS.map(
    (kind) => byKind.get(kind) ?? { id: "", orgId, serviceKind: kind, goalCheckinDays: 30, trainerRatingDays: 90, updatedAt: new Date() }
  );
}

export async function updateCheckinConfig(
  orgId: string,
  serviceKind: ServiceKind,
  input: { goalCheckinDays: number; trainerRatingDays: number }
) {
  await prisma.checkinScheduleConfig.upsert({
    where: { orgId_serviceKind: { orgId, serviceKind } },
    create: { orgId, serviceKind, ...input },
    update: input,
  });
  return { ok: true as const };
}

/**
 * RB-IA-006/RB-RRHH-011 (decisión §11.6): pregunta periódicamente al cliente si
 * ha cambiado su objetivo (check-in) y, con otra cadencia, le pide valorar a su
 * entrenador. Sin worker en este stack, se invoca desde /api/jobs/run.
 */
export async function runPeriodicCheckinRule(orgId: string): Promise<number> {
  const configs = await getCheckinConfigs(orgId);
  const configByKind = new Map(configs.map((c) => [c.serviceKind, c]));

  const members = await prisma.member.findMany({
    where: { orgId, state: "ACTIVE", userId: { not: null } },
    include: { subscriptions: { include: { plan: { select: { type: true } } } } },
  });

  let created = 0;
  for (const member of members) {
    const kinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
    if (kinds.length === 0) continue;
    const serviceConfigs = kinds.map((k) => configByKind.get(KIND_MAP[k])).filter(Boolean) as NonNullable<
      ReturnType<typeof configByKind.get>
    >[];
    const goalCheckinDays = Math.min(...serviceConfigs.map((c) => c.goalCheckinDays));
    const trainerRatingDays = Math.min(...serviceConfigs.map((c) => c.trainerRatingDays));

    const lastGoalCheckin = await prisma.selfAssessment.findFirst({
      where: { memberId: member.id, kind: "checkin-objetivos" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!lastGoalCheckin || Date.now() - lastGoalCheckin.createdAt.getTime() > goalCheckinDays * 24 * 60 * 60 * 1000) {
      await createNotificationOnce({
        orgId,
        recipientUserId: member.userId!,
        kind: "TASK",
        title: "¿Cómo va tu objetivo?",
        body: "Cuéntanos si lo has cambiado, si notas estancamiento o si quieres ir a por más — tu entrenador lo verá en tu ficha.",
        entityType: "SelfAssessmentPrompt",
        entityId: member.id,
      });
      created++;
    }

    if (member.trainerId) {
      const lastRating = await prisma.trainerRating.findFirst({
        where: { memberId: member.id, trainerUserId: member.trainerId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!lastRating || Date.now() - lastRating.createdAt.getTime() > trainerRatingDays * 24 * 60 * 60 * 1000) {
        await createNotificationOnce({
          orgId,
          recipientUserId: member.userId!,
          kind: "TASK",
          title: "Valora a tu entrenador",
          body: "Tu opinión es confidencial y solo la ve dirección (RB-RRHH-011/012).",
          entityType: "TrainerRatingPrompt",
          entityId: member.id,
        });
        created++;
      }
    }
  }
  return created;
}

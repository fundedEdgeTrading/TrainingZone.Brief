import { prisma } from "@/lib/prisma";
import { canViewTrainerRatings } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * Punto único de acceso a valoraciones de entrenadores (RB-RRHH-011/012):
 * matriz INVERTIDA respecto a health-access.ts — solo dirección puede leer,
 * NUNCA el propio entrenador (ni sobre sí mismo). Mismo patrón: gate + null
 * en vez de error, sin revelar si hay datos a quien no tiene permiso.
 */
export async function getTrainerRatings(orgId: string, actorRole: Role, trainerUserId?: string) {
  if (!canViewTrainerRatings(actorRole)) return null;
  return prisma.trainerRating.findMany({
    where: { orgId, trainerUserId: trainerUserId || undefined },
    include: { trainer: { select: { name: true } }, member: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTrainerRatingSummary(orgId: string, actorRole: Role) {
  if (!canViewTrainerRatings(actorRole)) return null;
  const rows = await prisma.trainerRating.groupBy({
    by: ["trainerUserId"],
    where: { orgId, score: { not: null } },
    _avg: { score: true },
    _count: { _all: true },
  });
  const trainers = await prisma.user.findMany({ where: { orgId, role: "TRAINER" }, select: { id: true, name: true } });
  return trainers.map((t) => {
    const row = rows.find((r) => r.trainerUserId === t.id);
    return { trainerUserId: t.id, name: t.name, avgScore: row?._avg.score ?? null, count: row?._count._all ?? 0 };
  });
}

export type TrainerRatingWriteResult = { ok: true } | { ok: false; error: string };

/** El cliente valora a SU entrenador asignado (nunca a otro). */
export async function submitTrainerRating(
  orgId: string,
  memberUserId: string,
  input: { score?: number; strengths?: string; improvements?: string }
): Promise<TrainerRatingWriteResult> {
  const member = await prisma.member.findFirst({ where: { orgId, userId: memberUserId }, select: { id: true, trainerId: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!member.trainerId) return { ok: false, error: "No tienes un entrenador asignado." };

  await prisma.trainerRating.create({
    data: {
      orgId,
      memberId: member.id,
      trainerUserId: member.trainerId,
      score: input.score,
      strengths: input.strengths?.trim() || null,
      improvements: input.improvements?.trim() || null,
    },
  });
  return { ok: true };
}

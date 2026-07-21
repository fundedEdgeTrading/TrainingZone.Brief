import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FEW_SESSIONS_THRESHOLD = 4; // decisión §11.8: salvaguarda equivalente en volumen

/**
 * RB-RRHH-006 (decisión §11.8): a un cliente de EP le quedan pocas sesiones YA
 * PROGRAMADAS en el calendario (no confundir con sesiones consumidas del bono).
 * Dispara cuando el calendario futuro cubre menos de 2 semanas, o hay 4
 * sesiones o menos programadas — lo que se cumpla antes.
 */
export async function runFewSessionsScheduledRule(orgId: string): Promise<number> {
  const now = new Date();
  const epClients = await prisma.member.findMany({
    where: {
      orgId,
      state: "ACTIVE",
      trainerId: { not: null },
      subscriptions: { some: { status: "ACTIVE", plan: { type: "PERSONAL_TRAINING" } } },
    },
    select: { id: true, firstName: true, lastName: true, trainerId: true },
  });

  let created = 0;
  for (const member of epClients) {
    const futureBookings = await prisma.booking.findMany({
      where: { memberId: member.id, status: "BOOKED", session: { orgId, status: "SCHEDULED", date: { gte: now } } },
      include: { session: { select: { date: true } } },
      orderBy: { session: { date: "asc" } },
    });

    const count = futureBookings.length;
    const lastDate = futureBookings[futureBookings.length - 1]?.session.date;
    const coversLessThanTwoWeeks = !lastDate || lastDate.getTime() - now.getTime() < TWO_WEEKS_MS;

    if (count <= FEW_SESSIONS_THRESHOLD || coversLessThanTwoWeeks) {
      await createNotificationOnce({
        orgId,
        recipientUserId: member.trainerId!,
        kind: "TASK",
        title: `${member.firstName} ${member.lastName}: pocas sesiones programadas`,
        body: `Le quedan ${count} sesión(es) de EP en el calendario (RB-RRHH-006). Programa más entrenamientos.`,
        entityType: "Member",
        entityId: member.id,
      });
      created++;
    }
  }
  return created;
}

/**
 * RB-RRHH-007 (ejemplo de notificación accionable): al bono de sesiones le
 * quedan pocas unidades — reutiliza Subscription.sessionsRemaining, sin
 * esquema nuevo.
 */
export async function runLowPackBalanceRule(orgId: string): Promise<number> {
  const lowPacks = await prisma.subscription.findMany({
    where: { status: "ACTIVE", sessionsRemaining: { lte: 2, gt: 0 }, member: { orgId, state: "ACTIVE" } },
    include: { member: { select: { id: true, firstName: true, lastName: true, trainerId: true } }, plan: { select: { name: true } } },
  });

  const directors = await prisma.user.findMany({ where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] } }, select: { id: true } });

  let created = 0;
  for (const sub of lowPacks) {
    const recipients = sub.member.trainerId ? [sub.member.trainerId] : directors.map((d) => d.id);
    for (const recipientUserId of recipients) {
      await createNotificationOnce({
        orgId,
        recipientUserId,
        kind: "TASK",
        title: `${sub.member.firstName} ${sub.member.lastName}: le quedan ${sub.sessionsRemaining} sesiones del bono`,
        body: `${sub.plan.name} — ¿va a renovar?`,
        entityType: "Member",
        entityId: sub.member.id,
      });
      created++;
    }
  }
  return created;
}

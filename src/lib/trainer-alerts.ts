import { prisma } from "@/lib/prisma";
import { createNotificationOnce, pickCenterTaskRecipient } from "@/lib/notifications";
import { AUTO_TASK_RULES } from "@/lib/tasks";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FEW_SESSIONS_THRESHOLD = 4; // decisión §11.8: salvaguarda equivalente en volumen

/**
 * Quién recibe una alerta comercial sobre un socio (E14-11, abanico).
 *
 * Las dos reglas de este fichero creaban UNA TAREA POR CADA PERSONA DE
 * DIRECCIÓN: con siete, cada socio generaba siete tarjetas idénticas. Ahora es
 * una sola, con dueño elegido por reparto (`pickCenterTaskRecipient`), y
 * dirección la reasigna desde el tablero si le toca a otro.
 *
 * Los candidatos se acotan además al centro del socio, como ya hacía
 * `no-show-alerts.ts` (E1-07): la dirección de organización manda en toda la
 * suya y siempre entra, pero el nombre y apellidos de un socio de La Jota no
 * tienen por qué aparecer en la bandeja de Santander.
 */
async function centerDirectors(orgId: string, centerId: string) {
  return prisma.user.findMany({
    where: {
      orgId,
      deactivatedAt: null,
      OR: [
        { role: "OWNER" },
        {
          role: "CENTER_DIRECTOR",
          // Imputación real, igual que `centerScopeFor`: centro base más las
          // filas de `CenterMembership`.
          OR: [{ centerId }, { centerMemberships: { some: { centerId } } }],
        },
      ],
    },
    select: { id: true },
  });
}

/**
 * RB-RRHH-006 (decisión §11.8): a un cliente de EP le quedan pocas sesiones YA
 * PROGRAMADAS en el calendario (no confundir con sesiones consumidas del bono).
 * Dispara cuando el calendario futuro cubre menos de 2 semanas, o hay 4
 * sesiones o menos programadas — lo que se cumpla antes.
 *
 * Devuelve cuántas tareas se han ESCRITO: ni las que ya estaban abiertas ni las
 * que el tope semanal ha dejado para más adelante (E14-12).
 */
export async function runFewSessionsScheduledRule(orgId: string): Promise<number> {
  const now = new Date();
  const epClients = await prisma.member.findMany({
    where: {
      orgId,
      state: "ACTIVE",
      subscriptions: { some: { status: "ACTIVE", plan: { type: "PERSONAL_TRAINING" } } },
    },
    select: { id: true, firstName: true, lastName: true, primaryCenterId: true },
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
    if (count > FEW_SESSIONS_THRESHOLD && !coversLessThanTwoWeeks) continue;

    const candidates = await centerDirectors(orgId, member.primaryCenterId);
    const recipientUserId = await pickCenterTaskRecipient(
      orgId,
      candidates.map((d) => d.id)
    );
    // Sin dirección en el centro no hay a quién encargárselo. Que el tope esté
    // lleno NO se decide aquí: `createNotificationOnce` es quien lo aplica y
    // quien deja el aviso en la bandeja de quien corresponda.
    if (!recipientUserId) continue;

    const result = await createNotificationOnce({
      orgId,
      recipientUserId,
      kind: "TASK",
      title: `${member.firstName} ${member.lastName}: pocas sesiones programadas`,
      body: `Le quedan ${count} sesión(es) de EP en el calendario (RB-RRHH-006). Programa más entrenamientos.`,
      entityType: AUTO_TASK_RULES.fewSessionsScheduled.entityType,
      entityId: member.id,
    });
    if (result.status === "created") created++;
  }
  return created;
}

/**
 * RB-RRHH-007 (ejemplo de notificación accionable): al bono de sesiones le
 * quedan pocas unidades — reutiliza Subscription.sessionsRemaining, sin
 * esquema nuevo.
 *
 * Es la tarea que más vende y hasta E14-11 era la que no se creaba: compartía
 * clave de deduplicación con la regla de arriba (`entityType = "Member"`), así
 * que a un socio que ya tuviera abierta la de «pocas sesiones programadas» esta
 * nunca le llegaba. Ahora cada regla tiene su entidad propia y las dos conviven.
 */
export async function runLowPackBalanceRule(orgId: string): Promise<number> {
  const lowPacks = await prisma.subscription.findMany({
    where: { status: "ACTIVE", sessionsRemaining: { lte: 2, gt: 0 }, member: { orgId, state: "ACTIVE" } },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, primaryCenterId: true } },
      plan: { select: { name: true } },
    },
  });

  let created = 0;
  for (const sub of lowPacks) {
    const candidates = await centerDirectors(orgId, sub.member.primaryCenterId);
    const recipientUserId = await pickCenterTaskRecipient(
      orgId,
      candidates.map((d) => d.id)
    );
    if (!recipientUserId) continue;

    const result = await createNotificationOnce({
      orgId,
      recipientUserId,
      kind: "TASK",
      // Es trabajo comercial con fecha de caducidad: si el bono se agota antes
      // de que nadie llame, la renovación se pierde.
      priority: "ALTA",
      title: `${sub.member.firstName} ${sub.member.lastName}: le quedan ${sub.sessionsRemaining} sesiones del bono`,
      body: `${sub.plan.name} — ¿va a renovar?`,
      entityType: AUTO_TASK_RULES.lowPackBalance.entityType,
      entityId: sub.member.id,
    });
    if (result.status === "created") created++;
  }
  return created;
}

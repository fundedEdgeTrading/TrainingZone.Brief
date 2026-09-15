import { prisma } from "@/lib/prisma";
import { cancelMember } from "@/lib/member-lifecycle";

/**
 * RB-PAGO-006: ejecuta las cancelaciones de suscripción programadas cuya fecha
 * ya se ha cumplido. Sin worker en este stack, se invoca desde /api/jobs/run
 * (mismo patrón que el resto de reglas temporales del CRM).
 *
 * E14-16 · La baja la escribe `member-lifecycle.ts` y no este fichero. El motivo
 * lo dejó escrito quien PROGRAMÓ la cancelación semanas antes
 * (`billing/subscription-actions.ts::scheduleCancellation`), que es el único
 * momento en el que hay alguien a quien preguntárselo; el cron lo recoge de
 * `Member.cancelReasonId` y, si por lo que sea faltara, cae en el motivo de
 * sistema en vez de dejar al socio sin porqué.
 */
export async function runScheduledCancellationsRule(orgId: string): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { member: { orgId }, status: { in: ["ACTIVE", "FROZEN"] }, cancelAt: { lte: new Date() } },
    select: { id: true, memberId: true },
  });
  if (!due.length) return 0;

  for (const s of due) {
    await cancelMember({ kind: "system", orgId, source: "cron-cancelaciones-programadas" }, s.memberId, {
      subscriptionIds: [s.id],
      systemReasonLabel: SCHEDULED_CANCELLATION_REASON_LABEL,
    });
  }
  return due.length;
}

/**
 * Red de seguridad: una baja programada ANTES de que el motivo fuera obligatorio
 * llega aquí sin `cancelReasonId`. Se le pone esta entrada del catálogo, que
 * dirección puede renombrar, en vez de dejar el socio sin motivo — que es
 * justamente lo que la campaña de reactivación no sabe leer.
 */
export const SCHEDULED_CANCELLATION_REASON_LABEL = "Baja programada (sin motivo registrado)";

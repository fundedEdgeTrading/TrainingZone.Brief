"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, memberIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import { canAdjustSessionBalance } from "@/lib/rbac";
import { getMemberSessionCalendar, type MemberCalendarEvent } from "@/lib/members-queries";
import { parseDateParam } from "@/lib/date-utils";

/**
 * Ajuste manual del saldo de un bono + paginación del calendario de la sección
 * "Plan y pagos" de la ficha del socio.
 *
 * Vive aquí y NO en billing/subscription-actions.ts a propósito: aquel fichero
 * comparte un `ALLOWED_ROLES` de módulo (OWNER/CENTER_DIRECTOR/RECEPTION) entre
 * todos sus exports, y el eje de esta funcionalidad es justamente que el
 * ENTRENADOR entra. Meter allí un conjunto de roles divergente es una trampa
 * para quien luego reutilice la constante.
 */
const STAFF = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"] as const;

/** Tope defensivo: un dedo pegado al "+" no debe poder dejar un bono en 10.000. */
const MAX_SESSIONS_REMAINING = 999;

export type AdjustSessionsResult =
  | { ok: true; sessionsRemaining: number }
  | { ok: false; error: string };

const adjustSchema = z.object({
  subscriptionId: z.string().min(1),
  delta: z
    .number()
    .int()
    .refine((d) => d !== 0)
    .refine((d) => Math.abs(d) <= MAX_SESSIONS_REMAINING),
});

/**
 * Suma o resta sesiones al saldo de un bono (RB-RES-006).
 *
 * El ajuste es un DELTA, nunca un valor absoluto: el saldo lo descuenta el
 * motor de reservas al reservar (portal-queries.ts::bookSessionForMember) y lo
 * devuelve al cancelar, desde el portal web y desde la app nativa. Escribir el
 * número que leyó el navegador hace unos segundos desharía en silencio una
 * reserva concurrente.
 *
 * Consecuencia deliberada: si dos personas pulsan "+1" a la vez el resultado es
 * +2, no +1, y cada ajuste queda auditado por separado. Eso es lo correcto bajo
 * semántica de delta — no es un fallo que haya que "arreglar" a
 * último-escritor-gana.
 */
export async function adjustSubscriptionSessions(
  subscriptionId: string,
  delta: number
): Promise<AdjustSessionsResult> {
  const session = await requireRole([...STAFF]);
  // Doble cinturón (mismo patrón que deleteMember): el rol abre la página, el
  // predicado abre la acción.
  if (!canAdjustSessionBalance(session.user.role)) {
    return { ok: false, error: "No tienes permiso para ajustar el saldo de sesiones." };
  }

  const parsed = adjustSchema.safeParse({ subscriptionId, delta });
  if (!parsed.success) return { ok: false, error: "El ajuste indicado no es válido." };

  // Aislamiento multi-tenant: Subscription NO tiene columna orgId, solo se
  // llega a ella a través del socio.
  const sub = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, member: { orgId: session.user.orgId } },
    select: {
      id: true,
      memberId: true,
      centerId: true,
      status: true,
      sessionsRemaining: true,
      plan: { select: { id: true, name: true } },
    },
  });
  if (!sub) return { ok: false, error: "No se ha encontrado ese bono." };
  if (!(await memberIsInScope(session.user, sub.memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  // Mismo conjunto que `manageableSubscriptions` en la ficha. Recargar un bono
  // CANCELLED lo resucitaría a medias: tendría saldo, pero el motor de reservas
  // (activeBookingSubscriptions) lo seguiría ignorando. Para vender más
  // sesiones ya está "Añadir bono" en Plan y pagos.
  if (sub.status !== "ACTIVE" && sub.status !== "FROZEN") {
    return { ok: false, error: "Solo se puede ajustar el saldo de bonos activos o congelados." };
  }
  if (sub.sessionsRemaining == null) {
    return { ok: false, error: "Este bono es ilimitado: no tiene saldo de sesiones que ajustar." };
  }
  if (sub.sessionsRemaining + delta < 0) {
    return { ok: false, error: "El saldo no puede quedar en negativo." };
  }
  if (sub.sessionsRemaining + delta > MAX_SESSIONS_REMAINING) {
    return { ok: false, error: `El saldo máximo por bono es de ${MAX_SESSIONS_REMAINING} sesiones.` };
  }

  // Escritura RELATIVA y condicional: la condición viaja dentro del WHERE para
  // que arbitre la base de datos, igual que el descuento de la reserva. Si
  // entre la lectura de arriba y este UPDATE el socio ha reservado, el
  // incremento se aplica sobre el saldo real en vez de pisarlo.
  //
  // Con `sessionsRemaining` NULL ninguna de las dos condiciones casa (NULL >= n
  // es UNKNOWN en SQL), así que una carrera nunca convierte un bono ilimitado
  // en numérico. La lectura previa solo sirve para dar un error en castellano.
  const applied = await prisma.subscription.updateMany({
    where: {
      id: sub.id,
      member: { orgId: session.user.orgId },
      status: { in: ["ACTIVE", "FROZEN"] },
      sessionsRemaining: delta < 0 ? { gte: -delta } : { lte: MAX_SESSIONS_REMAINING - delta },
    },
    data: { sessionsRemaining: { increment: delta } },
  });
  if (applied.count === 0) {
    return { ok: false, error: "El saldo ha cambiado mientras editabas. Vuelve a intentarlo." };
  }

  // `updateMany` no devuelve la fila: se relee para auditar el valor real.
  const after = await prisma.subscription.findUniqueOrThrow({
    where: { id: sub.id },
    select: { sessionsRemaining: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "SUBSCRIPTION_SESSIONS_ADJUSTED",
      entityType: "Subscription",
      entityId: sub.id,
      memberId: sub.memberId,
      metadata: {
        delta,
        previousSessionsRemaining: sub.sessionsRemaining,
        newSessionsRemaining: after.sessionsRemaining ?? 0,
        planId: sub.plan.id,
        planName: sub.plan.name,
        centerId: sub.centerId,
        subscriptionStatus: sub.status,
      },
    },
  });

  // Las vistas del socio (/portal/*) son dinámicas —pasan por requireSession()
  // → cookies()—, así que no hay nada cacheado que revalidar allí.
  revalidatePath(`/members/${sub.memberId}`);
  revalidatePath("/billing");
  return { ok: true, sessionsRemaining: after.sessionsRemaining ?? 0 };
}

export type MemberSessionsMonthResult =
  | { ok: true; events: MemberCalendarEvent[] }
  | { ok: false; error: string };

/**
 * Un mes suelto del calendario del socio, para cuando se navega fuera de la
 * ventana que precarga la página.
 *
 * Existe para que el calendario NO tenga que cambiar la URL: hacerlo
 * re-renderizaría /members/[id] entera y `getHealthRecordsForMember` escribe una
 * fila de AuditLog (HEALTH_RECORD_READ, Art. 9 RGPD) en CADA lectura — pasar de
 * mes llenaría el registro de accesos a datos de salud de accesos que nadie ha
 * hecho.
 */
export async function fetchMemberSessionsMonth(
  memberId: string,
  month: string // "YYYY-MM"
): Promise<MemberSessionsMonthResult> {
  const session = await requireRole([...STAFF]);
  if (!(await memberIsInScope(session.user, memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes no válido." };

  const from = parseDateParam(`${month}-01`);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);

  // getMemberSessionCalendar ya filtra por member.orgId (aislamiento tenant).
  const events = await getMemberSessionCalendar(session.user.orgId, memberId, from, to);
  return { ok: true, events };
}

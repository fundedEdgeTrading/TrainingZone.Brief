import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bonoUsage, effectiveSessionsIncluded, planServiceKind } from "@/lib/session-balance";
import { formatDateParam } from "@/lib/date-utils";
import { LEDGER_REASON_LABEL, ledgerTotals } from "@/lib/session-ledger";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

/**
 * «Historial de consumo» del socio: el libro mayor del bono, no la lista de
 * clases a las que fue.
 *
 * E2-15 · RB-VENTA-008. Antes esta pantalla se contradecía a sí misma: la
 * tarjeta decía "5 gastadas de 12", el resumen decía "0 gastadas" y "9 no
 * presentadas", y el listado que promete *"aquí aparece cada sesión gastada y
 * cada devolución"* no tenía ni una línea de consumo. La causa era que el
 * movimiento se DERIVABA de `booking.subscriptionId` —y 1.458 de 1.458
 * `ATTENDED` y 155 de 155 `NO_SHOW` lo tenían a NULL, porque la cancelación lo
 * pone a null y la reserva agendada a mano nunca lo puso— mientras las
 * devoluciones se leían solo de `AuditLog`, que únicamente escribía el descarte
 * móvil.
 *
 * Ahora las tres cifras salen de `SessionLedger`, así que no pueden
 * contradecirse: son la misma lista contada de tres maneras. El movimiento se
 * ESCRIBE cuando ocurre (invariante del trimestre: nada mueve
 * `sessionsRemaining` sin dejar asiento), no se reconstruye después.
 */
const MAX_MOVEMENTS = 120;

type Movement = {
  id: string;
  day: string;
  concept: string;
  reason: string | null;
  serviceKind: "EP" | "GROUP" | null;
  delta: number;
  balanceAfter: number | null;
  tone: "neutral" | "critical" | "good";
};

export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const subscriptions = await prisma.subscription.findMany({
    where: { memberId: member.id, status: { in: ["ACTIVE", "FROZEN"] } },
    include: { plan: true, center: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const kindOf = new Map(subscriptions.map((s) => [s.id, planServiceKind(s.plan.type) ?? null]));

  const entries = await prisma.sessionLedger.findMany({
    where: { subscriptionId: { in: subscriptions.map((s) => s.id) } },
    select: {
      id: true,
      subscriptionId: true,
      delta: true,
      balanceAfter: true,
      reason: true,
      note: true,
      createdAt: true,
      booking: { select: { session: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_MOVEMENTS,
  });

  const movements: Movement[] = entries.map((entry) => ({
    id: entry.id,
    day: formatDateParam(entry.createdAt),
    // El nombre de la clase cuando el movimiento viene de una reserva; si la
    // sesión se borró, la FK quedó a null y manda la etiqueta del motivo.
    concept: entry.booking?.session.name ?? LEDGER_REASON_LABEL[entry.reason],
    reason: entry.booking ? LEDGER_REASON_LABEL[entry.reason] : entry.note,
    serviceKind: (kindOf.get(entry.subscriptionId) ?? null) as "EP" | "GROUP" | null,
    delta: entry.delta,
    balanceAfter: entry.balanceAfter,
    tone: entry.delta > 0 ? "good" : entry.reason === "BOOKING" ? "neutral" : "critical",
  }));

  // Las tres cifras del resumen salen de la MISMA lista que el listado, así que
  // ninguna puede contradecir a las otras dos.
  const totals = ledgerTotals(entries);

  // Desde cuándo hay detalle: el asiento más antiguo que se conserva. Antes de
  // esa fecha solo está el saldo de apertura (ver `backfillOpeningEntries`), y
  // decirlo evita que un socio lea el listado como si fuera todo su histórico.
  const oldest = await prisma.sessionLedger.findFirst({
    where: { subscriptionId: { in: subscriptions.map((s) => s.id) } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  return apiOk({
    balances: subscriptions.map((s) => {
      const usage = bonoUsage(effectiveSessionsIncluded(s), s.sessionsRemaining);
      return {
        subscriptionId: s.id,
        planName: s.plan.name,
        serviceKind: planServiceKind(s.plan.type) ?? "GROUP",
        unlimited: usage == null,
        remaining: usage?.remaining ?? null,
        used: usage?.used ?? null,
        total: usage?.total ?? null,
        renewsAt: s.endDate ? formatDateParam(s.endDate) : null,
      };
    }),
    summary: {
      spent: totals.spent,
      returned: totals.returned,
    },
    detailSince: oldest ? formatDateParam(oldest.createdAt) : null,
    movements,
  });
}

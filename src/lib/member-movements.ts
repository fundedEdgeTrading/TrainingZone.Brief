import { prisma } from "@/lib/prisma";
import { bonoUsage, effectiveSessionsIncluded, planServiceKind, type ServiceKind } from "@/lib/session-balance";
import { formatDateParam } from "@/lib/date-utils";
import { LEDGER_REASON_LABEL, ledgerTotals } from "@/lib/session-ledger";
import type { BookingStatus } from "@prisma/client";

/**
 * E5-09 · el libro de movimientos del bono, en un solo sitio para que el
 * portal y la API móvil (`/api/mobile/v1/portal/consumption`) lean SIEMPRE la
 * misma consulta. Antes esta consulta solo existía en la API móvil (E2-15); el
 * escenario "paridad con la app" pide explícitamente que las dos cifras
 * coincidan porque comparten origen, no porque las dos consultas se parezcan
 * — de ahí que viva aquí y ambas superficies la importen, en vez de que la web
 * la reproduzca "como espejo" (el fallo que este trimestre repite más, según
 * AGENTS.md).
 */
const MAX_MOVEMENTS = 120;

export type MemberMovement = {
  id: string;
  day: string;
  concept: string;
  reason: string | null;
  serviceKind: "EP" | "GROUP" | null;
  delta: number;
  balanceAfter: number | null;
  tone: "neutral" | "critical" | "good";
  /** Estado de la reserva que provocó el movimiento, cuando la hay (escenario "asistencia"). */
  bookingStatus: BookingStatus | null;
};

export type MemberBalance = {
  subscriptionId: string;
  planName: string;
  serviceKind: ServiceKind;
  unlimited: boolean;
  remaining: number | null;
  used: number | null;
  total: number | null;
  renewsAt: string | null;
};

export type MemberMovementsView = {
  balances: MemberBalance[];
  summary: { spent: number; returned: number };
  detailSince: string | null;
  movements: MemberMovement[];
};

export async function getMemberMovements(memberId: string): Promise<MemberMovementsView> {
  const subscriptions = await prisma.subscription.findMany({
    where: { memberId, status: { in: ["ACTIVE", "FROZEN"] } },
    include: { plan: true, center: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const kindOf = new Map(subscriptions.map((s) => [s.id, planServiceKind(s.plan.type) ?? null]));
  const subscriptionIds = subscriptions.map((s) => s.id);

  const entries = await prisma.sessionLedger.findMany({
    where: { subscriptionId: { in: subscriptionIds } },
    select: {
      id: true,
      subscriptionId: true,
      delta: true,
      balanceAfter: true,
      reason: true,
      note: true,
      createdAt: true,
      booking: { select: { status: true, session: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_MOVEMENTS,
  });

  const movements: MemberMovement[] = entries.map((entry) => ({
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
    bookingStatus: entry.booking?.status ?? null,
  }));

  // Las tres cifras del resumen salen de la MISMA lista que el listado, así que
  // ninguna puede contradecir a las otras dos.
  const totals = ledgerTotals(entries);

  // Desde cuándo hay detalle: el asiento más antiguo que se conserva. Antes de
  // esa fecha solo está el saldo de apertura (ver `backfillOpeningEntries`), y
  // decirlo evita que un socio lea el listado como si fuera todo su histórico.
  const oldest = await prisma.sessionLedger.findFirst({
    where: { subscriptionId: { in: subscriptionIds } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  return {
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
  };
}

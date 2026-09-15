import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv-export";
import { PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { stripeReadClient } from "@/lib/billing-shared";
import { reconcilePeriod, type PeriodReconciliation } from "@/lib/stripe-balance";
import {
  dateCell,
  euroCell,
  listAccountingMovements,
  totalsOf,
  type AccountingMovement,
  type AccountingTotals,
} from "@/lib/stripe-export";

/**
 * HU-ST-26 · Informes financieros de Stripe bajo demanda. **PISTA P4.**
 *
 * El informe se construye sobre los MISMOS movimientos que el extracto contable
 * de HU-ST-25 (`listAccountingMovements`) y el mismo cuadre (`reconcilePeriod`).
 * Ese es todo el sentido del orden de las historias: un informe que agregara por
 * su cuenta acabaría dando una cifra distinta de la que la gestoría tiene en el
 * CSV, y entonces no hay contra qué contrastarlo — hay dos verdades.
 *
 * Lo que el informe añade sobre el extracto es el saldo VIVO de la cuenta
 * conectada, que no está en nuestra base: cuánto hay disponible y cuánto sigue
 * pendiente de liquidar en Stripe. Se pide con `stripeReadClient` y degrada con
 * su mensaje si Stripe contesta mal: un informe sin el saldo sigue valiendo,
 * un informe que revienta no.
 */

// ---------------------------------------------------------------------------
// ¿Hay cobros conectados?
// ---------------------------------------------------------------------------

export type StripeConnection =
  | { connected: true; accountId: string; livemode: boolean }
  | { connected: false; reason: string };

/**
 * Escenario "sin Stripe conectado": la sección tiene que EXPLICAR que hace
 * falta conectar cobros, no pintar un botón que no puede hacer nada. Esta
 * función es la que decide cuál de las dos cosas se enseña, y devuelve el
 * motivo real (sin cuenta conectada / sin clave en el entorno) en vez de un
 * "no disponible" que no dice a dónde ir.
 */
export async function stripeConnectionFor(orgId: string): Promise<StripeConnection> {
  const client = await stripeReadClient(orgId);
  if (!client.ok) return { connected: false, reason: client.error };
  return { connected: true, accountId: client.accountId, livemode: client.livemode };
}

// ---------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------

export type MethodBreakdown = {
  method: PaymentMethod;
  label: string;
  charges: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
};

export type StripeBalanceSnapshot = { availableCents: number; pendingCents: number; currency: string };

export type FinancialReport = {
  periodLabel: string;
  from?: Date;
  to?: Date;
  scopeLabel: string;
  generatedAt: Date;
  totals: AccountingTotals;
  byMethod: MethodBreakdown[];
  reconciliation: PeriodReconciliation;
  /** Saldo vivo de la cuenta conectada. `null` si no se pudo leer. */
  balance: StripeBalanceSnapshot | null;
  /** Por qué falta el saldo, cuando falta. Se enseña en la propia tarjeta. */
  balanceError: string | null;
  livemode: boolean | null;
};

function breakdownByMethod(movements: AccountingMovement[]): MethodBreakdown[] {
  const porMetodo = new Map<PaymentMethod, MethodBreakdown>();

  for (const m of movements) {
    const fila = porMetodo.get(m.method) ?? {
      method: m.method,
      label: PAYMENT_METHOD_LABEL[m.method] ?? m.method,
      charges: 0,
      grossCents: 0,
      feeCents: 0,
      netCents: 0,
    };
    // Las devoluciones ya vienen en negativo: se suman, no se restan aparte, y
    // así el neto por método es el neto de verdad de ese método.
    fila.charges += m.kind === "COBRO" ? 1 : 0;
    fila.grossCents += m.grossCents;
    fila.feeCents += m.feeCents;
    fila.netCents += m.netCents;
    porMetodo.set(m.method, fila);
  }

  return [...porMetodo.values()].sort((a, b) => b.netCents - a.netCents);
}

/** Saldo de la cuenta conectada, en la divisa del gimnasio (o la primera que haya). */
async function readBalance(
  orgId: string
): Promise<{ balance: StripeBalanceSnapshot | null; error: string | null; livemode: boolean | null }> {
  const client = await stripeReadClient(orgId);
  if (!client.ok) return { balance: null, error: client.error, livemode: null };

  try {
    const balance = await client.stripe.balance.retrieve({}, { stripeAccount: client.accountId });
    const available = balance.available[0];
    const pending = balance.pending[0];
    return {
      balance: {
        availableCents: available?.amount ?? 0,
        pendingCents: pending?.amount ?? 0,
        currency: available?.currency ?? pending?.currency ?? "eur",
      },
      error: null,
      livemode: client.livemode,
    };
  } catch (error) {
    // HU-ST-24 pide lo mismo para su consola: la tarjeta degrada con SU mensaje
    // en vez de tumbar la pantalla. Aquí, además, el resto del informe sale
    // igual: sale de nuestra base, no de Stripe.
    return {
      balance: null,
      error: error instanceof Error ? error.message : String(error),
      livemode: client.livemode,
    };
  }
}

export async function buildFinancialReport(
  orgId: string,
  opts: {
    from?: Date;
    to?: Date;
    centerIds?: string[];
    periodLabel?: string;
    scopeLabel?: string;
    generatedAt?: Date;
  } = {}
): Promise<FinancialReport> {
  const { from, to, centerIds } = opts;
  const generatedAt = opts.generatedAt ?? new Date();

  const [movements, reconciliation, saldo] = await Promise.all([
    listAccountingMovements(orgId, { from, to, centerIds }),
    reconcilePeriod(orgId, { from, to, centerIds }),
    readBalance(orgId),
  ]);

  return {
    periodLabel: opts.periodLabel ?? (from && to ? `${dateCell(from)} a ${dateCell(to)}` : "todo el histórico"),
    from,
    to,
    scopeLabel: opts.scopeLabel ?? (centerIds === undefined ? "Toda la organización" : "Tus centros"),
    generatedAt,
    totals: totalsOf(movements),
    byMethod: breakdownByMethod(movements),
    reconciliation,
    balance: saldo.balance,
    balanceError: saldo.error,
    livemode: saldo.livemode,
  };
}

// ---------------------------------------------------------------------------
// El fichero que se descarga
// ---------------------------------------------------------------------------

export function financialReportCsv(report: FinancialReport): string {
  const { totals, reconciliation } = report;

  const lineas: (string | number)[][] = [
    ["INFORME FINANCIERO"],
    [`Periodo: ${report.periodLabel}`],
    [`Ámbito: ${report.scopeLabel}`],
    [`Generado: ${dateCell(report.generatedAt)}`],
    ...(report.livemode === false ? [["Entorno: PRUEBAS (clave de test). Las cifras no son dinero real."]] : []),
    [],
    ["RESUMEN", "Euros"],
    ["Bruto cobrado", euroCell(totals.grossCents)],
    ["Comisión de Stripe", euroCell(totals.feeCents)],
    ["Devuelto", euroCell(-totals.refundedCents)],
    ["Neto real", euroCell(totals.netCents)],
    ["Cobros", totals.charges],
    ["Devoluciones", totals.refunds],
    [],
    ["POR MÉTODO DE COBRO", "Cobros", "BrutoEuros", "ComisionEuros", "NetoEuros"],
    ...report.byMethod.map((m) => [
      m.label,
      m.charges,
      euroCell(m.grossCents),
      euroCell(m.feeCents),
      euroCell(m.netCents),
    ]),
    [],
    ["LIQUIDACIÓN", "Euros"],
    ["Payouts liquidados en el periodo", euroCell(reconciliation.payoutsTotalCents)],
    ["Suma de netos de sus cobros", euroCell(reconciliation.netTotalCents)],
    ["Cobrado y aún sin liquidar", euroCell(reconciliation.unsettledNetCents)],
    [
      "Cuadra",
      reconciliation.orgWide ? (reconciliation.balanced ? "Sí" : "No") : "Parcial: ámbito de centro",
    ],
    [],
    ["SALDO EN STRIPE", "Euros"],
    ...(report.balance
      ? [
          ["Disponible", euroCell(report.balance.availableCents)],
          ["Pendiente de liquidar", euroCell(report.balance.pendingCents)],
        ]
      : [["No se pudo leer el saldo", report.balanceError ?? "Stripe no contestó."]]),
  ];

  return toCsv(lineas[0] as string[], lineas.slice(1));
}

export function financialReportFileName(from?: Date, to?: Date, generatedAt: Date = new Date()): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (from && to) return `informe-financiero-${iso(from)}_${iso(to)}.csv`;
  return `informe-financiero-${iso(generatedAt)}.csv`;
}

// ---------------------------------------------------------------------------
// Rastro
// ---------------------------------------------------------------------------

export const FINANCIAL_REPORT_ACTION = "FINANCIAL_REPORT_EXPORTED";

/** Mismo criterio que el extracto: pedir un informe y llevárselo deja rastro. */
export async function logFinancialReport(input: {
  orgId: string;
  actorUserId: string;
  from?: Date;
  to?: Date;
  centerIds?: string[];
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: FINANCIAL_REPORT_ACTION,
      entityType: "Payment",
      entityId: input.orgId,
      metadata: {
        from: input.from?.toISOString() ?? null,
        to: input.to?.toISOString() ?? null,
        centerIds: input.centerIds ?? null,
      },
    },
  });
}

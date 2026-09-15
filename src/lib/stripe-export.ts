import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv-export";
import { PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { reconcilePeriod, type PeriodReconciliation } from "@/lib/stripe-balance";

/**
 * HU-ST-25 · Exportación contable para la gestoría (regla `RB-BI-023`,
 * decisión **D-S8**). **PISTA P4.**
 *
 * Lo que sale de aquí es un EXTRACTO DE COBROS, no una serie de facturación, y
 * el propio fichero lo dice en su cabecera. No es adorno: sin esa frase la
 * gestoría trata el CSV como libro registro de IVA y le pide a Apta una
 * numeración correlativa que Apta no emite — Apta factura solo su licencia al
 * centro (B2B) y el centro factura al socio con su propio software.
 *
 * Formato español, el mismo de `export-ranking-button` y del resto de
 * exportaciones: punto y coma, BOM y fin de línea CRLF. Se usa `toCsv`
 * (csv-export.ts) en vez de reescribirlo aquí: ese duplicado es exactamente el
 * fallo que ya está documentado con las tablas de permisos "espejo".
 */

// ---------------------------------------------------------------------------
// Qué NO es este fichero (decisión D-S8)
// ---------------------------------------------------------------------------

export const ACCOUNTING_DECLARATION = [
  "EXTRACTO DE COBROS — NO ES UNA SERIE DE FACTURACIÓN NI UN LIBRO REGISTRO DE IVA.",
  "Apta factura solo su licencia al centro (B2B). El centro factura al socio con su propio software (decisión D-S8).",
  "Los importes salen del balance transaction de Stripe: bruto cobrado, comisión de Stripe y neto liquidado.",
] as const;

export const ACCOUNTING_HEADERS = [
  "Fecha",
  "Socio",
  "Concepto",
  "BrutoEuros",
  "ComisionEuros",
  "NetoEuros",
  "Metodo",
  "IdStripe",
  "Payout",
  "Motivo",
] as const;

// ---------------------------------------------------------------------------
// El periodo: la gestoría trabaja por meses naturales
// ---------------------------------------------------------------------------

export type AccountingMonth = { id: string; label: string; from: Date; to: Date };

const MONTH_ID = /^(\d{4})-(\d{2})$/;

function monthOf(year: number, monthIndex: number): AccountingMonth {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  // Día 0 del mes siguiente = último día de éste, sin tablas de días por mes ni
  // casos especiales de año bisiesto.
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const id = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const label = from.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return { id, label: label.charAt(0).toUpperCase() + label.slice(1), from, to };
}

/** `?mes=AAAA-MM`. Un valor ausente o inventado cae en el mes en curso. */
export function parseAccountingMonth(value: string | undefined, now: Date = new Date()): AccountingMonth {
  const match = value ? MONTH_ID.exec(value) : null;
  if (!match) return monthOf(now.getFullYear(), now.getMonth());

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return monthOf(now.getFullYear(), now.getMonth());
  return monthOf(year, month - 1);
}

/** Los últimos `count` meses, el actual primero: es el selector de la pantalla. */
export function recentAccountingMonths(count = 12, now: Date = new Date()): AccountingMonth[] {
  return Array.from({ length: count }, (_, i) => monthOf(now.getFullYear(), now.getMonth() - i));
}

// ---------------------------------------------------------------------------
// Movimientos del periodo
// ---------------------------------------------------------------------------

export type AccountingMovementKind = "COBRO" | "DEVOLUCION";

export type AccountingMovement = {
  kind: AccountingMovementKind;
  paymentId: string;
  date: Date;
  memberName: string;
  centerId: string | null;
  concept: string;
  /** En céntimos. En una devolución los tres van en NEGATIVO. */
  grossCents: number;
  feeCents: number;
  netCents: number;
  method: PaymentMethod;
  stripeRef: string;
  payoutRef: string;
  reason: string;
};

function nombre(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

/** Importe en euros con coma decimal: es lo que espera Excel en español. */
export function euroCell(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** `DD/MM/AAAA`, que es como lee las fechas una gestoría española. */
export function dateCell(date: Date): string {
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

const PAYMENT_SELECT = {
  id: true,
  date: true,
  amountCents: true,
  method: true,
  status: true,
  notes: true,
  grossAmountCents: true,
  feeAmountCents: true,
  netAmountCents: true,
  refundedAmountCents: true,
  refundedAt: true,
  refundReason: true,
  stripePaymentIntentId: true,
  stripeInvoiceId: true,
  stripeCheckoutSessionId: true,
  stripeRefundId: true,
  stripeCreditNoteId: true,
  member: { select: { firstName: true, lastName: true, primaryCenterId: true } },
  subscription: { select: { plan: { select: { name: true } } } },
  payout: { select: { stripePayoutId: true } },
} as const;

type PaymentRow = {
  id: string;
  date: Date;
  amountCents: number;
  method: PaymentMethod;
  notes: string | null;
  grossAmountCents: number | null;
  feeAmountCents: number | null;
  netAmountCents: number | null;
  refundedAmountCents: number | null;
  refundedAt: Date | null;
  refundReason: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  stripeCheckoutSessionId: string | null;
  stripeRefundId: string | null;
  stripeCreditNoteId: string | null;
  member: { firstName: string; lastName: string; primaryCenterId: string | null };
  subscription: { plan: { name: string } } | null;
  payout: { stripePayoutId: string } | null;
};

function stripeRefOf(p: PaymentRow): string {
  return p.stripePaymentIntentId ?? p.stripeInvoiceId ?? p.stripeCheckoutSessionId ?? "";
}

function conceptOf(p: PaymentRow): string {
  return p.subscription?.plan.name ?? p.notes ?? "Cobro";
}

function chargeMovement(p: PaymentRow): AccountingMovement {
  // Un cobro de caja (efectivo, transferencia, datáfono) no pasa por Stripe y
  // no tiene comisión: su bruto ES su neto. Ponerle una comisión de cero es la
  // verdad, no un relleno.
  const gross = p.grossAmountCents ?? p.amountCents;
  const fee = p.feeAmountCents ?? 0;
  const net = p.netAmountCents ?? gross - fee;

  return {
    kind: "COBRO",
    paymentId: p.id,
    date: p.date,
    memberName: nombre(p.member),
    centerId: p.member.primaryCenterId,
    concept: conceptOf(p),
    grossCents: gross,
    feeCents: fee,
    netCents: net,
    method: p.method,
    stripeRef: stripeRefOf(p),
    payoutRef: p.payout?.stripePayoutId ?? "",
    reason: "",
  };
}

function refundMovement(p: PaymentRow): AccountingMovement {
  // `refundedAmountCents` es null en las devoluciones del flujo antiguo, que no
  // guardaba importe: entonces se devolvió todo.
  const devuelto = p.refundedAmountCents ?? p.amountCents;

  return {
    kind: "DEVOLUCION",
    paymentId: p.id,
    date: p.refundedAt ?? p.date,
    memberName: nombre(p.member),
    centerId: p.member.primaryCenterId,
    concept: `Devolución · ${conceptOf(p)}`,
    // EN NEGATIVO. Stripe no devuelve la comisión del cobro original, así que
    // la devolución no lleva comisión propia: su impacto en el neto es el
    // importe entero.
    grossCents: -devuelto,
    feeCents: 0,
    netCents: -devuelto,
    method: p.method,
    stripeRef: p.stripeRefundId ?? p.stripeCreditNoteId ?? stripeRefOf(p),
    payoutRef: "",
    reason: p.refundReason ?? "Sin motivo registrado",
  };
}

/**
 * Cobros y devoluciones del periodo, con ámbito de centro.
 *
 * `centerIds` es lo que devuelve `centerScopeFor` (center-scope.ts):
 * `undefined` = sin frontera (dirección de organización). Un CSV no puede
 * llevarse los cobros de otro centro, así que el filtro va en la consulta, no
 * en el render.
 *
 * Las devoluciones se buscan por su PROPIA fecha (`refundedAt`) y no por la del
 * cobro: una devolución de octubre sobre un cobro de septiembre es un
 * movimiento de octubre, y colgarla del mes del cobro descuadra los dos meses.
 */
export async function listAccountingMovements(
  orgId: string,
  opts: { from?: Date; to?: Date; centerIds?: string[] } = {}
): Promise<AccountingMovement[]> {
  const { from, to, centerIds } = opts;
  const centerFilter = centerIds !== undefined ? { member: { primaryCenterId: { in: centerIds } } } : {};
  const dentroDelPeriodo = (campo: "date" | "refundedAt") =>
    from || to ? { [campo]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const [cobros, devoluciones] = await Promise.all([
    prisma.payment.findMany({
      where: { orgId, status: { in: ["PAID", "REFUNDED"] }, ...centerFilter, ...dentroDelPeriodo("date") },
      select: PAYMENT_SELECT,
      orderBy: { date: "asc" },
    }),
    prisma.payment.findMany({
      where: { orgId, refundedAt: { not: null }, ...centerFilter, ...dentroDelPeriodo("refundedAt") },
      select: PAYMENT_SELECT,
      orderBy: { refundedAt: "asc" },
    }),
  ]);

  const movimientos = [...cobros.map(chargeMovement), ...devoluciones.map(refundMovement)];
  return movimientos.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
}

export type AccountingTotals = {
  grossCents: number;
  feeCents: number;
  netCents: number;
  refundedCents: number;
  charges: number;
  refunds: number;
};

export function totalsOf(movements: AccountingMovement[]): AccountingTotals {
  return movements.reduce<AccountingTotals>(
    (totals, m) => ({
      grossCents: totals.grossCents + m.grossCents,
      feeCents: totals.feeCents + m.feeCents,
      netCents: totals.netCents + m.netCents,
      refundedCents: totals.refundedCents + (m.kind === "DEVOLUCION" ? -m.netCents : 0),
      charges: totals.charges + (m.kind === "COBRO" ? 1 : 0),
      refunds: totals.refunds + (m.kind === "DEVOLUCION" ? 1 : 0),
    }),
    { grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 0, charges: 0, refunds: 0 }
  );
}

// ---------------------------------------------------------------------------
// El fichero
// ---------------------------------------------------------------------------

export type AccountingExport = {
  movements: AccountingMovement[];
  totals: AccountingTotals;
  reconciliation: PeriodReconciliation;
  csv: string;
  fileName: string;
};

function periodLabel(from?: Date, to?: Date): string {
  if (from && to) return `${dateCell(from)} a ${dateCell(to)}`;
  if (from) return `desde ${dateCell(from)}`;
  if (to) return `hasta ${dateCell(to)}`;
  return "todo el histórico";
}

/**
 * Compone el CSV: declaración, tabla de movimientos con su total, y bloque de
 * cuadre contra los payouts liquidados.
 *
 * `toCsv(cabecera, filas)` no distingue la primera fila de las demás —une
 * todas igual—, así que se le pasa la primera línea de la declaración como
 * "cabecera" y el resto como filas. Así hay UNA sola implementación del formato
 * español y el bloque declarativo va delante de la tabla, que es donde tiene
 * que estar para que se lea antes de mirar las cifras.
 */
export function buildAccountingCsv(input: {
  movements: AccountingMovement[];
  totals: AccountingTotals;
  reconciliation: PeriodReconciliation;
  from?: Date;
  to?: Date;
  scopeLabel: string;
  generatedAt?: Date;
}): string {
  const { movements, totals, reconciliation, from, to, scopeLabel } = input;
  const generatedAt = input.generatedAt ?? new Date();

  const lineas: (string | number)[][] = [
    [ACCOUNTING_DECLARATION[0]],
    [ACCOUNTING_DECLARATION[1]],
    [ACCOUNTING_DECLARATION[2]],
    [`Periodo: ${periodLabel(from, to)}`],
    [`Ámbito: ${scopeLabel}`],
    [`Generado: ${dateCell(generatedAt)}`],
    [],
    [...ACCOUNTING_HEADERS],
    ...movements.map((m) => [
      dateCell(m.date),
      m.memberName,
      m.concept,
      euroCell(m.grossCents),
      euroCell(m.feeCents),
      euroCell(m.netCents),
      PAYMENT_METHOD_LABEL[m.method] ?? m.method,
      m.stripeRef,
      m.payoutRef,
      m.reason,
    ]),
    [
      "TOTAL",
      "",
      `${totals.charges} cobros y ${totals.refunds} devoluciones`,
      euroCell(totals.grossCents),
      euroCell(totals.feeCents),
      euroCell(totals.netCents),
      "",
      "",
      "",
      "",
    ],
    [],
    ["CUADRE DEL PERIODO"],
    ["Payout", "FechaLlegada", "ImporteEuros", "SumaNetosEuros", "Cuadra"],
    ...reconciliation.payouts.map((p) => [
      p.stripePayoutId,
      p.arrivalDate ? dateCell(p.arrivalDate) : "",
      euroCell(p.amountCents),
      euroCell(p.netSumCents),
      p.balanced ? "Sí" : "No",
    ]),
    [
      "TOTAL LIQUIDADO",
      "",
      euroCell(reconciliation.payoutsTotalCents),
      euroCell(reconciliation.netTotalCents),
      reconciliation.balanced ? "Sí" : "No",
    ],
    ["Cobrado y aún sin liquidar", "", "", euroCell(reconciliation.unsettledNetCents), ""],
    ...(reconciliation.orgWide
      ? []
      : [
          [
            "Este cuadre es parcial: se ha exportado el ámbito de centro de quien lo pidió, no toda la organización.",
          ],
        ]),
  ];

  return toCsv(lineas[0] as string[], lineas.slice(1));
}

export function accountingFileName(from?: Date, to?: Date, generatedAt: Date = new Date()): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (from && to) return `contabilidad-${iso(from)}_${iso(to)}.csv`;
  return `contabilidad-${iso(generatedAt)}.csv`;
}

/**
 * La exportación completa: movimientos, totales, cuadre y el fichero ya
 * compuesto. Es el único sitio desde el que se arma el CSV contable, para que
 * la pantalla y cualquier futura tarea programada exporten lo mismo.
 */
export async function buildAccountingExport(
  orgId: string,
  opts: { from?: Date; to?: Date; centerIds?: string[]; scopeLabel?: string; generatedAt?: Date } = {}
): Promise<AccountingExport> {
  const { from, to, centerIds } = opts;
  const generatedAt = opts.generatedAt ?? new Date();

  const [movements, reconciliation] = await Promise.all([
    listAccountingMovements(orgId, { from, to, centerIds }),
    reconcilePeriod(orgId, { from, to, centerIds }),
  ]);
  const totals = totalsOf(movements);

  return {
    movements,
    totals,
    reconciliation,
    csv: buildAccountingCsv({
      movements,
      totals,
      reconciliation,
      from,
      to,
      scopeLabel: opts.scopeLabel ?? (centerIds === undefined ? "Toda la organización" : "Tus centros"),
      generatedAt,
    }),
    fileName: accountingFileName(from, to, generatedAt),
  };
}

// ---------------------------------------------------------------------------
// Rastro: quién se llevó qué periodo y cuándo
// ---------------------------------------------------------------------------

export const ACCOUNTING_EXPORT_ACTION = "ACCOUNTING_EXPORTED";

/**
 * Toda exportación deja `AuditLog`. Un CSV con los cobros de todos los socios
 * de un centro sale del sistema y deja de estar bajo su control: sin esta fila
 * no hay forma de saber quién se lo llevó, de qué periodo ni cuándo.
 */
export async function logAccountingExport(input: {
  orgId: string;
  actorUserId: string;
  from?: Date;
  to?: Date;
  centerIds?: string[];
  rows: number;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: ACCOUNTING_EXPORT_ACTION,
      entityType: "Payment",
      entityId: input.orgId,
      metadata: {
        from: input.from?.toISOString() ?? null,
        to: input.to?.toISOString() ?? null,
        centerIds: input.centerIds ?? null,
        rows: input.rows,
      },
    },
  });
}

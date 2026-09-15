import type Stripe from "stripe";
import type { PayoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripeReadClient } from "@/lib/billing-shared";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-23 · Neto real, comisiones y payouts. **PISTA P4.**
 *
 * S1 dejó el módulo cableado al despachador de webhook (`payout.paid` /
 * `payout.failed`) y con el punto de enganche ya llamado desde la conciliación
 * de `member-billing.ts`. Aquí va el cuerpo, sin tocar ninguno de esos dos
 * ficheros compartidos.
 *
 * Tablas y columnas que la migración del lote ya dejó puestas:
 *   · `StripePayout` (importe, `arrivalDate`, estado, motivo del fallo), con
 *     unicidad `(orgId, stripePayoutId)` → upsert idempotente.
 *   · `Payment.grossAmountCents` / `feeAmountCents` / `netAmountCents` /
 *     `stripeBalanceTransactionId` / `payoutId`.
 *
 * El cuadre del escenario "suma de netos == importe del payout" solo sale si
 * las dos mitades se escriben: el desglose por cobro (`recordBalanceBreakdown`)
 * y la liquidación (`reconcilePayout`). Por eso la liquidación también
 * RELLENA el desglose que falte: un cobro anterior a este módulo no tiene
 * `netAmountCents`, y sin él su payout nunca cuadraría.
 */

/** Tope de páginas al recorrer los balance transactions de un payout. */
const MAX_BALANCE_TRANSACTION_PAGES = 20;
const BALANCE_TRANSACTION_PAGE_SIZE = 100;

/**
 * Componer el payout son varias llamadas a Stripe colgadas de un webhook, y
 * Stripe espera su 200 en 20 s. Con el timeout por defecto del SDK (80 s) una
 * sola llamada lenta bastaba para que el evento se diera por fallido y volviera
 * a entregarse; sin reintentos de red, además, no se multiplica la espera.
 */
const COMPOSE_REQUEST = { timeout: 15_000, maxNetworkRetries: 0 } as const;

/**
 * Tipos de balance transaction que representan DINERO DE UN COBRO. El resto
 * (el propio `payout`, las tarifas sueltas de Stripe, los ajustes de reserva)
 * no tiene `Payment` al que apuntar y se salta sin ruido.
 */
const CHARGE_LIKE_TYPES = new Set<Stripe.BalanceTransaction.Type>(["charge", "payment"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `payout.status` de Stripe → el enum del esquema. */
export function payoutStatusFrom(status: string | null | undefined, eventType?: string): PayoutStatus {
  switch (status) {
    case "paid":
      return "PAID";
    case "in_transit":
      return "IN_TRANSIT";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    case "pending":
      return "PENDING";
    default:
      // Sin estado utilizable se cree al evento que lo trajo: `payout.failed`
      // con un `status` desconocido es un fallo, no un "pendiente" que se
      // quedaría esperando para siempre en la vista de dirección.
      return eventType === "payout.failed" ? "FAILED" : "PENDING";
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.id;
  return null;
}

// ---------------------------------------------------------------------------
// Desglose bruto / comisión / neto de un cobro
// ---------------------------------------------------------------------------

type PaymentRefs = {
  id: string;
  orgId: string;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
};

type ReadClient = { stripe: Stripe; accountId: string };

/**
 * Referencia del CARGO de un cobro cuando la factura no la trae.
 *
 * `resolveInvoiceChargeId` (stripe-invoice.ts) es el atajo: devuelve el campo
 * legado si la cuenta está pinneada a una versión antigua de la API, y `null`
 * en la vigente. Éste es el camino largo, y hace falta justo en el caso normal.
 */
async function resolveChargeId(client: ReadClient, payment: PaymentRefs): Promise<string | null> {
  const options = { stripeAccount: client.accountId };

  if (payment.stripePaymentIntentId) {
    const intent = await client.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {}, options);
    const charge = idOf(intent.latest_charge);
    if (charge) return charge;
  }

  if (payment.stripeInvoiceId) {
    const invoice = await client.stripe.invoices.retrieve(
      payment.stripeInvoiceId,
      { expand: ["payments"] },
      options
    );
    for (const entry of invoice.payments?.data ?? []) {
      const intentId = idOf(entry.payment?.payment_intent ?? null);
      if (!intentId) continue;
      const intent = await client.stripe.paymentIntents.retrieve(intentId, {}, options);
      const charge = idOf(intent.latest_charge);
      if (charge) return charge;
    }
  }

  return null;
}

/** El balance transaction del cargo: de ahí salen bruto, comisión y neto. */
async function resolveBalanceTransaction(
  client: ReadClient,
  charge: Stripe.Charge | string | null,
  payment: PaymentRefs
): Promise<Stripe.BalanceTransaction | null> {
  const options = { stripeAccount: client.accountId };

  // El cargo ya expandido puede traer el balance transaction dentro: si viene,
  // nos ahorramos las dos llamadas.
  if (charge && typeof charge !== "string" && charge.balance_transaction && typeof charge.balance_transaction === "object") {
    return charge.balance_transaction;
  }

  const chargeId = idOf(charge) ?? (await resolveChargeId(client, payment));
  if (!chargeId) return null;

  const full = await client.stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] }, options);
  const balanceTransaction = full.balance_transaction;
  if (!balanceTransaction) return null;
  if (typeof balanceTransaction !== "string") return balanceTransaction;

  return client.stripe.balanceTransactions.retrieve(balanceTransaction, {}, options);
}

/**
 * PUNTO DE ENGANCHE del desglose, llamado desde `reconcileMemberInvoicePaid()`
 * en `member-billing.ts` en cuanto el cobro queda conciliado.
 *
 * `charge` es lo que la factura sabe del cargo: el id (lo normal en una cuenta
 * pinneada a una versión antigua), el objeto ya expandido, o `null` en la API
 * vigente — y entonces se resuelve aquí por el PaymentIntent o por la factura.
 *
 * DEVUELVE `void` Y NO PUEDE LANZAR. Es un enganche contable colgado del camino
 * del cobro: si revienta, tumba la conciliación de un pago que SÍ ha entrado y
 * Stripe reintenta un `invoice.paid` que ya estaba bien. El desglose es
 * reconstruible después (`reconcilePayout` lo rellena al liquidar); el cobro no.
 * De ahí el try/catch que envuelve TODO el cuerpo.
 */
export async function recordBalanceBreakdown(
  paymentId: string,
  charge: Stripe.Charge | string | null
): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        orgId: true,
        stripeBalanceTransactionId: true,
        stripePaymentIntentId: true,
        stripeInvoiceId: true,
      },
    });
    if (!payment) {
      console.warn("[stripe-balance] desglose sin cobro al que apuntar", { paymentId });
      return;
    }
    // Idempotencia: una reentrega del mismo evento no vuelve a llamar a Stripe.
    if (payment.stripeBalanceTransactionId) return;

    const client = await stripeReadClient(payment.orgId);
    if (!client.ok) {
      console.info("[stripe-balance] desglose aplazado, sin lectura de Stripe", { paymentId, motivo: client.error });
      return;
    }

    const balanceTransaction = await resolveBalanceTransaction(client, charge, payment);
    if (!balanceTransaction) {
      console.info("[stripe-balance] el cobro no tiene balance transaction todavía", { paymentId });
      return;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        grossAmountCents: balanceTransaction.amount,
        feeAmountCents: balanceTransaction.fee,
        netAmountCents: balanceTransaction.net,
        stripeBalanceTransactionId: balanceTransaction.id,
      },
    });
  } catch (error) {
    // El cobro está bien; lo que falla es la anotación contable. Se registra y
    // se sigue: `reconcilePayout` vuelve a intentarlo al liquidar el payout.
    console.error("[stripe-balance] no se pudo anotar el desglose del cobro", {
      paymentId,
      error: errorMessage(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Liquidación: qué cobros componen un payout
// ---------------------------------------------------------------------------

/**
 * Enlaza los cobros que componen un payout y rellena el desglose que les falte.
 *
 * El objeto `Payout` NO trae sus cobros: hay que listar los balance
 * transactions del payout contra la cuenta conectada. Cada uno de tipo `charge`
 * o `payment` es un cobro nuestro, y se localiza por dos vías, en este orden:
 *   1. `Payment.stripeBalanceTransactionId`, que ya escribió el enganche.
 *   2. El cargo del propio balance transaction → su PaymentIntent o su factura.
 *      Es la vía que salva los cobros anteriores a este módulo: sin ella
 *      nunca tendrían neto y su payout no cuadraría jamás.
 */
async function linkPayoutPayments(
  client: ReadClient,
  orgId: string,
  payoutRowId: string,
  stripePayoutId: string
): Promise<number> {
  const options = { stripeAccount: client.accountId, ...COMPOSE_REQUEST };
  let enlazados = 0;
  let starting_after: string | undefined;

  for (let page = 0; page < MAX_BALANCE_TRANSACTION_PAGES; page++) {
    const lote = await client.stripe.balanceTransactions.list(
      { payout: stripePayoutId, limit: BALANCE_TRANSACTION_PAGE_SIZE, starting_after },
      options
    );

    for (const bt of lote.data) {
      if (!CHARGE_LIKE_TYPES.has(bt.type)) continue;

      const yaEnlazado = await prisma.payment.findFirst({
        where: { orgId, stripeBalanceTransactionId: bt.id },
        select: { id: true, payoutId: true },
      });
      if (yaEnlazado) {
        if (yaEnlazado.payoutId !== payoutRowId) {
          await prisma.payment.update({ where: { id: yaEnlazado.id }, data: { payoutId: payoutRowId } });
        }
        enlazados++;
        continue;
      }

      const chargeId = idOf(bt.source as string | { id: string } | null);
      if (!chargeId || !chargeId.startsWith("ch_")) continue;

      // `Charge` ya no trae `invoice` en la versión de API que tipa el SDK
      // instalado, así que el puente es el PaymentIntent: es la referencia que
      // el cobro guarda en las dos vías (checkout y factura recurrente).
      const charge = await client.stripe.charges.retrieve(chargeId, {}, options);
      const intentId = idOf(charge.payment_intent);
      if (!intentId) continue;

      const pago = await prisma.payment.findFirst({
        where: { orgId, stripePaymentIntentId: intentId },
        select: { id: true },
      });
      if (!pago) continue;

      await prisma.payment.update({
        where: { id: pago.id },
        data: {
          payoutId: payoutRowId,
          grossAmountCents: bt.amount,
          feeAmountCents: bt.fee,
          netAmountCents: bt.net,
          stripeBalanceTransactionId: bt.id,
        },
      });
      enlazados++;
    }

    if (!lote.has_more || lote.data.length === 0) break;
    starting_after = lote.data[lote.data.length - 1].id;
  }

  return enlazados;
}

/**
 * `payout.paid` / `payout.failed` · La liquidación de Stripe a la cuenta
 * bancaria del gimnasio.
 *
 * El upsert por `(orgId, stripePayoutId)` lo hace idempotente frente a
 * reentregas. Si falla la ESCRITURA se pide reintento: el payout es lo que
 * dirección mira para saber cuándo entra el dinero. Si lo que falla es la
 * LECTURA de su composición, el payout ya está guardado y se devuelve `ok`:
 * la composición se reconstruye en la siguiente entrega o desde la pantalla de
 * contabilidad, y un reintento infinito contra una cuenta que ha revocado el
 * acceso no arregla nada.
 */
export async function reconcilePayout(
  orgId: string,
  payout: Stripe.Payout,
  eventType: string
): Promise<ReconcileResult> {
  const status = payoutStatusFrom(payout.status, eventType);
  const arrivalDate = payout.arrival_date ? new Date(payout.arrival_date * 1000) : null;
  // Un `payout.paid` posterior no puede dejar colgado el motivo del fallo de un
  // intento anterior: se limpia explícitamente cuando ya no está fallido.
  const failureMessage = status === "FAILED" ? (payout.failure_message ?? null) : null;

  let payoutRowId: string;
  try {
    const fila = await prisma.stripePayout.upsert({
      where: { orgId_stripePayoutId: { orgId, stripePayoutId: payout.id } },
      create: {
        orgId,
        stripePayoutId: payout.id,
        amountCents: payout.amount,
        currency: payout.currency,
        status,
        arrivalDate,
        failureMessage,
      },
      update: { amountCents: payout.amount, currency: payout.currency, status, arrivalDate, failureMessage },
      select: { id: true },
    });
    payoutRowId = fila.id;
  } catch (error) {
    return { ok: false, retry: true, error: `No se pudo guardar el payout ${payout.id}: ${errorMessage(error)}` };
  }

  // Una línea por payout atendido, pase lo que pase con la composición. Es el
  // rastro de operación que el despachador de S1 espera de este módulo —cada
  // pista deja el suyo— y es lo que permite saber, mirando el log, si un payout
  // entró completo o se guardó a medias.
  const client = await stripeReadClient(orgId);
  let composicion: string;
  if (!client.ok) {
    composicion = `sin composición (${client.error})`;
  } else {
    try {
      const enlazados = await linkPayoutPayments(client, orgId, payoutRowId, payout.id);
      composicion = `${enlazados} cobros enlazados`;
    } catch (error) {
      // El payout ya está guardado: se registra el motivo y se devuelve `ok`.
      // La composición se reconstruye en la siguiente entrega o desde la
      // pantalla de contabilidad; pedir reintento a Stripe contra una cuenta
      // que ha revocado el acceso no arregla nada.
      composicion = `composición fallida (${errorMessage(error)})`;
    }
  }

  console.info("[stripe-balance] payout conciliado", {
    orgId,
    eventType,
    payoutId: payout.id,
    status,
    arrivalDate: arrivalDate?.toISOString() ?? null,
    amount: payout.amount,
    composicion,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vista de payouts y cuadre (escenarios "vista de payouts" y "cuadre")
// ---------------------------------------------------------------------------

export type PayoutComposition = {
  paymentId: string;
  date: Date;
  memberName: string;
  centerId: string | null;
  grossAmountCents: number | null;
  feeAmountCents: number | null;
  netAmountCents: number | null;
};

export type PayoutView = {
  id: string;
  stripePayoutId: string;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  arrivalDate: Date | null;
  failureMessage: string | null;
  payments: PayoutComposition[];
  /** Suma de netos de los cobros VISIBLES para quien mira. */
  netSumCents: number;
  /**
   * `true` si la suma de netos da el importe del payout. Solo tiene sentido a
   * nivel de organización: con ámbito de centro se están viendo una parte de
   * los cobros, y una parte nunca puede cuadrar contra el total liquidado.
   */
  balanced: boolean | null;
};

/**
 * Payouts de la organización con los cobros que los componen.
 *
 * `centerIds` es el ámbito de centro de quien mira (`center-scope.ts`):
 * `undefined` = sin frontera. La composición se filtra por el centro del socio,
 * igual que el resto de Cobros — un director de centro no puede ver, ni
 * exportar, los cobros de otro centro de la misma organización.
 */
export async function listPayoutsWithComposition(
  orgId: string,
  opts: { centerIds?: string[]; from?: Date; to?: Date; take?: number } = {}
): Promise<PayoutView[]> {
  const { centerIds, from, to, take = 24 } = opts;

  const payouts = await prisma.stripePayout.findMany({
    where: {
      orgId,
      ...(from || to
        ? { arrivalDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: [{ arrivalDate: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      payments: {
        where: centerIds !== undefined ? { member: { primaryCenterId: { in: centerIds } } } : {},
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          grossAmountCents: true,
          feeAmountCents: true,
          netAmountCents: true,
          member: { select: { firstName: true, lastName: true, primaryCenterId: true } },
        },
      },
    },
  });

  return payouts.map((payout) => {
    const payments: PayoutComposition[] = payout.payments.map((p) => ({
      paymentId: p.id,
      date: p.date,
      memberName: `${p.member.firstName} ${p.member.lastName}`.trim(),
      centerId: p.member.primaryCenterId,
      grossAmountCents: p.grossAmountCents,
      feeAmountCents: p.feeAmountCents,
      netAmountCents: p.netAmountCents,
    }));
    const netSumCents = payments.reduce((sum, p) => sum + (p.netAmountCents ?? 0), 0);

    return {
      id: payout.id,
      stripePayoutId: payout.stripePayoutId,
      amountCents: payout.amountCents,
      currency: payout.currency,
      status: payout.status,
      arrivalDate: payout.arrivalDate,
      failureMessage: payout.failureMessage,
      payments,
      netSumCents,
      balanced: centerIds === undefined ? netSumCents === payout.amountCents : null,
    };
  });
}

export type PeriodReconciliation = {
  /** Payouts LIQUIDADOS (`PAID`) cuya fecha de llegada cae en el periodo. */
  payouts: { stripePayoutId: string; arrivalDate: Date | null; amountCents: number; netSumCents: number; balanced: boolean }[];
  payoutsTotalCents: number;
  netTotalCents: number;
  /** Cobros con neto anotado que todavía no ha liquidado ningún payout. */
  unsettledNetCents: number;
  balanced: boolean;
  /**
   * `false` cuando quien pide el cuadre solo ve una parte de la organización:
   * la cifra que se enseña es un subtotal, no un cuadre.
   */
  orgWide: boolean;
};

/**
 * Cuadre del periodo: la suma de netos de los cobros liquidados tiene que dar
 * la suma de los payouts que los liquidaron (HU-ST-23 "cuadre", HU-ST-25
 * "cuadre").
 *
 * Se compara contra los payouts **liquidados** (`PAID`) del periodo, no contra
 * todos los cobros del periodo: un cobro de fin de mes lo liquida un payout del
 * mes siguiente, así que "cobros del periodo == payouts del periodo" no cuadra
 * nunca. Lo que sí tiene que cuadrar, siempre, es cada payout contra los cobros
 * que Stripe dice que lo componen.
 */
export async function reconcilePeriod(
  orgId: string,
  opts: { centerIds?: string[]; from?: Date; to?: Date } = {}
): Promise<PeriodReconciliation> {
  const { centerIds, from, to } = opts;

  const payouts = await prisma.stripePayout.findMany({
    where: {
      orgId,
      status: "PAID",
      ...(from || to
        ? { arrivalDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { arrivalDate: "asc" },
    include: {
      payments: {
        where: centerIds !== undefined ? { member: { primaryCenterId: { in: centerIds } } } : {},
        select: { netAmountCents: true },
      },
    },
  });

  const filas = payouts.map((payout) => {
    const netSumCents = payout.payments.reduce((sum, p) => sum + (p.netAmountCents ?? 0), 0);
    return {
      stripePayoutId: payout.stripePayoutId,
      arrivalDate: payout.arrivalDate,
      amountCents: payout.amountCents,
      netSumCents,
      balanced: netSumCents === payout.amountCents,
    };
  });

  const unsettled = await prisma.payment.aggregate({
    where: {
      orgId,
      payoutId: null,
      netAmountCents: { not: null },
      ...(centerIds !== undefined ? { member: { primaryCenterId: { in: centerIds } } } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    _sum: { netAmountCents: true },
  });

  const payoutsTotalCents = filas.reduce((sum, f) => sum + f.amountCents, 0);
  const netTotalCents = filas.reduce((sum, f) => sum + f.netSumCents, 0);
  const orgWide = centerIds === undefined;

  return {
    payouts: filas,
    payoutsTotalCents,
    netTotalCents,
    unsettledNetCents: unsettled._sum.netAmountCents ?? 0,
    // Con ámbito de centro se ve una parte de los cobros del payout, así que
    // el "cuadre" sería falso por construcción: se marca como no cuadrado y
    // `orgWide: false` dice por qué.
    balanced: orgWide && filas.every((f) => f.balanced),
    orgWide,
  };
}

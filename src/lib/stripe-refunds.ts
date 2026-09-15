import type Stripe from "stripe";
import type { Prisma, Role } from "@prisma/client";
import type { ReconcileResult } from "@/lib/member-billing";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { assertRefundable } from "@/lib/billing-shared";
import { isMemberInScope, type ScopedUser } from "@/lib/center-scope";
import { creditNoteKey, refundKey } from "@/lib/stripe-idempotency";

/**
 * HU-ST-20 · Reembolsos reales y notas de crédito (decisión D-S7). **PISTA P2.**
 *
 * Dos mitades que no se pueden separar:
 *
 *  1. **Escritura** (`issueRefund`): dirección emite la devolución DESDE APTA.
 *     Es el lado que decide, cobra el motivo y deja la traza.
 *  2. **Conciliación** (`reconcileChargeRefunded`, `reconcileCreditNote`): lo
 *     que Stripe confirma después por webhook, venga de Apta o del Dashboard.
 *
 * Las dos escriben en el mismo `Payment`, y la primera NO espera a la segunda:
 * un refund confirmado por la API ya es dinero devuelto, y dejar la fila local
 * en PAID hasta que llegue el webhook significa que quien acaba de pulsar el
 * botón ve el cobro intacto y vuelve a pulsarlo. La conciliación es
 * idempotente precisamente para poder llegar después y no deshacer nada.
 *
 * Lo que S1 dejó resuelto y aquí no se rehace:
 *   · Deduplicación por `event.id` (HU-ST-05) en el despachador de webhook.
 *   · `{ ok: false, retry: true }` → 500 y Stripe reintenta con backoff. Es lo
 *     que hay que hacer cuando el `Payment` todavía no existe localmente:
 *     Stripe NO garantiza el orden y un `charge.refunded` puede adelantar al
 *     `invoice.paid` que crea la fila.
 *   · `assertRefundable()` (lib/billing-shared.ts) es el guardián compartido:
 *     un pago en efectivo NO llama a Stripe y un pago ya devuelto no se
 *     devuelve dos veces. No se escribe aquí una segunda versión.
 */

// ---------------------------------------------------------------------------
// Permisos: quién emite una devolución
// ---------------------------------------------------------------------------

/**
 * HU-ST-20, escenario "permisos": **solo dirección** emite un reembolso.
 *
 * No es `canManageBilling`, y la diferencia es el punto entero del escenario:
 * ese predicado incluye a RECEPCIÓN, que cobra y registra pagos todo el día. Un
 * reembolso saca dinero de la cuenta del gimnasio y no tiene vuelta atrás, así
 * que sigue la misma frontera que la baja de un socio (`canDeleteMembers`):
 * dirección de organización y dirección de centro.
 *
 * `PLATFORM_ADMIN` queda FUERA a propósito, aunque mande en la plataforma: el
 * soporte de Apta entra a diagnosticar, no a mover el dinero de un cliente.
 *
 * Vive aquí y no en `rbac.ts` porque ese fichero está congelado este trimestre.
 * Es una definición nueva, no una copia de una tabla existente: el día que
 * `rbac.ts` se abra, esta función se muda allí tal cual y los dos call sites
 * (la pantalla y la acción) siguen leyendo de un único sitio.
 */
export function canIssueRefund(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

export const REFUND_FORBIDDEN = "Solo dirección puede emitir una devolución.";
export const REFUND_REASON_REQUIRED = "El motivo de la devolución es obligatorio.";
/**
 * Distinto del `OUT_OF_CENTER_SCOPE` de `lib/guard.ts` a propósito: aquí lo que
 * se rechaza es un COBRO, no la ficha de un socio, y el mensaje tiene que decir
 * qué se ha intentado tocar.
 */
export const REFUND_OUT_OF_SCOPE = "Ese cobro no es de tus centros.";

// ---------------------------------------------------------------------------
// Emitir la devolución (lado de escritura)
// ---------------------------------------------------------------------------

export type IssueRefundInput = {
  /** Quien la emite, con su rol y su ámbito de centro. */
  actor: ScopedUser;
  paymentId: string;
  /** Céntimos. Omitido = todo lo que quede por devolver. */
  amountCents?: number;
  /** OBLIGATORIO. Va al AuditLog, al `Payment` y al metadata de Stripe. */
  reason: string;
};

export type IssueRefundResult =
  | {
      ok: true;
      /** `LOCAL` = cobro de caja, no ha pasado por Stripe. */
      via: "STRIPE" | "LOCAL";
      refundedAmountCents: number;
      /** Total devuelto del cobro tras esta operación. */
      totalRefundedCents: number;
      stripeRefundId?: string;
      stripeCreditNoteId?: string;
    }
  | { ok: false; error: string };

const REFUND_AUDIT_ENTITY = "Payment";
export const REFUND_AUDIT_ACTION_STRIPE = "PAYMENT_REFUNDED_STRIPE";
export const REFUND_AUDIT_ACTION_LOCAL = "PAYMENT_REFUNDED_LOCAL";

/**
 * HU-ST-20 · Emite la devolución de un cobro. Único camino de escritura.
 *
 * El orden de las comprobaciones no es casual — cada una tapa un escenario de
 * la historia:
 *
 *   1. **Permisos**: solo dirección (escenario "permisos").
 *   2. **Motivo**: obligatorio, y se comprueba ANTES de tocar nada. No es un
 *      campo opcional que nadie rellena: sin él no hay operación.
 *   3. **Ámbito de centro**: un cobro de otro centro no se devuelve (ni se ve).
 *   4. **`assertRefundable`**: decide efectivo vs. Stripe, y cuánto queda por
 *      devolver. Es el guardián compartido de S1, no una comprobación propia.
 *   5. **Clave de idempotencia**: el doble clic no emite dos refunds.
 *
 * Devuelve un resultado, no lanza: el call site enseña el motivo en pantalla.
 */
export async function issueRefund(input: IssueRefundInput): Promise<IssueRefundResult> {
  const { actor, paymentId } = input;
  const reason = input.reason.trim();

  if (!canIssueRefund(actor.role)) return { ok: false, error: REFUND_FORBIDDEN };
  if (!reason) return { ok: false, error: REFUND_REASON_REQUIRED };
  if (!paymentId) return { ok: false, error: "Falta el cobro que se quiere devolver." };

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, orgId: actor.orgId },
    select: {
      id: true,
      memberId: true,
      method: true,
      status: true,
      amountCents: true,
      refundedAmountCents: true,
      refundedAt: true,
      stripePaymentIntentId: true,
      stripeCheckoutSessionId: true,
      stripeInvoiceId: true,
    },
  });
  if (!payment) return { ok: false, error: "Cobro no encontrado." };

  // Ámbito de centro en la ESCRITURA, además de en la lectura de la pantalla:
  // `paymentId` llega de un formulario, que es manipulable, y el listado ya
  // filtrado no es una barrera.
  if (!(await isMemberInScope(actor, payment.memberId))) return { ok: false, error: REFUND_OUT_OF_SCOPE };

  const decision = assertRefundable(payment, input.amountCents);
  if (!decision.refundable) return { ok: false, error: decision.error };

  const amountCents = input.amountCents ?? decision.maxRefundableCents;
  const alreadyRefunded = payment.refundedAmountCents ?? 0;
  const totalRefundedCents = alreadyRefunded + amountCents;
  // Total devuelto == cobrado ⇒ el cobro queda REFUNDED. Un parcial deja el
  // estado en PAID: el cobro sigue siendo un cobro, con una parte devuelta.
  const fullyRefunded = totalRefundedCents >= payment.amountCents;

  // ---- Escenario "pago en efectivo": flujo local, SIN llamar a Stripe -------
  if (decision.via === "LOCAL") {
    await recordRefund({
      paymentId: payment.id,
      memberId: payment.memberId,
      orgId: actor.orgId,
      actorUserId: actor.id,
      reason,
      amountCents,
      totalRefundedCents,
      fullyRefunded,
      action: REFUND_AUDIT_ACTION_LOCAL,
      metadata: { via: "LOCAL", method: payment.method },
    });
    return { ok: true, via: "LOCAL", refundedAmountCents: amountCents, totalRefundedCents };
  }

  // ---- Cobro de Stripe: se emite contra la cuenta conectada -----------------
  const client = await stripeForOrg(actor.orgId);
  if (!client.ok) return { ok: false, error: client.error };

  // Una devolución contra una FACTURA de suscripción se emite como nota de
  // crédito y no como refund suelto: la factura ya está emitida, y rectificarla
  // es lo que exige un abono, no un movimiento de caja sin documento. La nota de
  // crédito lleva `refund_amount`, así que el dinero vuelve igualmente — es el
  // mismo refund, con su documento delante.
  const invoiceId = payment.stripeInvoiceId;

  try {
    if (invoiceId) {
      const creditNote = await client.stripe.creditNotes.create(
        {
          invoice: invoiceId,
          refund_amount: amountCents,
          memo: reason,
          metadata: { paymentId: payment.id, actorUserId: actor.id, motivo: reason },
        },
        {
          idempotencyKey: creditNoteKey(actor.orgId, invoiceId, amountCents, alreadyRefunded),
          stripeAccount: client.accountId,
        }
      );

      const refundId = creditNote.refunds?.[0]?.refund ?? null;
      await recordRefund({
        paymentId: payment.id,
        memberId: payment.memberId,
        orgId: actor.orgId,
        actorUserId: actor.id,
        reason,
        amountCents,
        totalRefundedCents,
        fullyRefunded,
        stripeRefundId: typeof refundId === "string" ? refundId : refundId?.id,
        stripeCreditNoteId: creditNote.id,
        action: REFUND_AUDIT_ACTION_STRIPE,
        metadata: { via: "CREDIT_NOTE", creditNoteId: creditNote.id, invoiceId },
      });

      return {
        ok: true,
        via: "STRIPE",
        refundedAmountCents: amountCents,
        totalRefundedCents,
        stripeCreditNoteId: creditNote.id,
        ...(typeof refundId === "string" ? { stripeRefundId: refundId } : {}),
      };
    }

    // `assertRefundable` ya ha garantizado que hay al menos una referencia; la
    // que sirve para devolver es el PaymentIntent.
    const paymentIntentId = payment.stripePaymentIntentId;
    if (!paymentIntentId) {
      return {
        ok: false,
        error:
          "Este cobro no tiene PaymentIntent con el que emitir la devolución. " +
          "Revísalo en el Dashboard de Stripe.",
      };
    }

    const refund = await client.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: amountCents,
        metadata: { paymentId: payment.id, actorUserId: actor.id, motivo: reason },
      },
      {
        idempotencyKey: refundKey(actor.orgId, payment.id, amountCents, alreadyRefunded),
        stripeAccount: client.accountId,
      }
    );

    await recordRefund({
      paymentId: payment.id,
      memberId: payment.memberId,
      orgId: actor.orgId,
      actorUserId: actor.id,
      reason,
      amountCents,
      totalRefundedCents,
      fullyRefunded,
      stripeRefundId: refund.id,
      action: REFUND_AUDIT_ACTION_STRIPE,
      metadata: { via: "REFUND", refundId: refund.id, paymentIntentId },
    });

    return { ok: true, via: "STRIPE", refundedAmountCents: amountCents, totalRefundedCents, stripeRefundId: refund.id };
  } catch (error) {
    // Un fallo de Stripe NO puede dejar el `Payment` marcado como devuelto: la
    // escritura local solo ocurre después de que Stripe confirme.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Stripe ha rechazado la devolución: ${message}` };
  }
}

/**
 * Escritura local de una devolución ya confirmada + su entrada de AuditLog.
 *
 * Van juntas y en una transacción porque separarlas es exactamente el fallo que
 * el escenario "permisos" persigue: una devolución sin autor ni motivo en el
 * log es una devolución que nadie firmó. El `AuditLog` es de SOLO INSERCIÓN
 * (E10-14), así que esto añade una fila, nunca corrige la anterior.
 */
async function recordRefund(params: {
  orgId: string;
  paymentId: string;
  memberId: string;
  actorUserId: string;
  reason: string;
  amountCents: number;
  totalRefundedCents: number;
  fullyRefunded: boolean;
  stripeRefundId?: string;
  stripeCreditNoteId?: string;
  action: string;
  metadata: Prisma.InputJsonValue;
}) {
  const refundedAt = new Date();
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: params.paymentId },
      data: {
        ...(params.fullyRefunded ? { status: "REFUNDED" as const } : {}),
        refundedAmountCents: params.totalRefundedCents,
        refundReason: params.reason,
        refundedAt,
        refundedByUserId: params.actorUserId,
        ...(params.stripeRefundId ? { stripeRefundId: params.stripeRefundId } : {}),
        ...(params.stripeCreditNoteId ? { stripeCreditNoteId: params.stripeCreditNoteId } : {}),
      },
    }),
    prisma.auditLog.create({
      data: {
        orgId: params.orgId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: REFUND_AUDIT_ENTITY,
        entityId: params.paymentId,
        memberId: params.memberId,
        metadata: {
          motivo: params.reason,
          amountCents: params.amountCents,
          totalRefundedCents: params.totalRefundedCents,
          fullyRefunded: params.fullyRefunded,
          ...(params.metadata as object),
        },
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Cuota prorrateada al darse de baja
// ---------------------------------------------------------------------------

export type ProrationPreview =
  | { ok: true; amountCents: number; periodEnd: Date | null }
  | { ok: false; error: string };

/**
 * HU-ST-20, escenario "cuota prorrateada al darse de baja": **lo calcula
 * Stripe, no nosotros**.
 *
 * La tentación es dividir la cuota entre los días del mes y multiplicar por los
 * que quedan. No sale el mismo número: Stripe prorratea por segundos sobre el
 * periodo real de facturación, descuenta los descuentos aplicados y tiene en
 * cuenta los cambios de plan a mitad de ciclo. Si Apta calcula su propio
 * prorrateo, el importe que se devuelve y el que la factura dice que sobraba
 * dejan de cuadrar, y esa diferencia la descubre el socio.
 *
 * Se pide la previsualización de la factura "si se cancelase ahora mismo" y se
 * suman las líneas NEGATIVAS, que son el crédito por el tiempo no consumido.
 * Se suman por importe y no por la forma del objeto `parent` de la línea a
 * propósito: esa forma cambia entre versiones de la API y el signo no.
 *
 * NO cancela nada ni devuelve nada: solo dice cuánto. Quien decide es dirección,
 * en la pantalla, y la devolución sale por `issueRefund` como cualquier otra.
 */
export async function previewCancellationProration(
  orgId: string,
  subscriptionId: string
): Promise<ProrationPreview> {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, member: { orgId } },
    select: { stripeSubscriptionId: true, endDate: true },
  });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };
  if (!subscription.stripeSubscriptionId) {
    return { ok: false, error: "Esta suscripción no es recurrente en Stripe: no hay prorrateo que previsualizar." };
  }

  const client = await stripeForOrg(orgId);
  if (!client.ok) return { ok: false, error: client.error };

  try {
    const preview = await client.stripe.invoices.createPreview(
      {
        subscription: subscription.stripeSubscriptionId,
        subscription_details: { cancel_now: true, proration_behavior: "create_prorations" },
      },
      { stripeAccount: client.accountId }
    );

    const creditCents = (preview.lines?.data ?? [])
      .map((line) => line.amount)
      .filter((amount) => amount < 0)
      .reduce((total, amount) => total + amount, 0);

    return { ok: true, amountCents: Math.abs(creditCents), periodEnd: subscription.endDate };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Stripe no ha podido calcular el prorrateo: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Lectura para la pantalla `/billing/reembolsos`
// ---------------------------------------------------------------------------

/**
 * `centerIds === undefined` es "sin frontera" (dirección de organización);
 * presente —aunque venga vacío— manda siempre. Es el mismo contrato que
 * `billing-queries.ts`, para que las dos pantallas no discrepen sobre qué ve
 * cada persona.
 */
function scopeWhere(orgId: string, centerIds?: string[]): Prisma.PaymentWhereInput {
  return {
    orgId,
    ...(centerIds !== undefined ? { member: { primaryCenterId: { in: centerIds } } } : {}),
  };
}

const REFUND_LIST_SELECT = {
  id: true,
  amountCents: true,
  method: true,
  status: true,
  date: true,
  receiptNumber: true,
  refundedAmountCents: true,
  refundReason: true,
  refundedAt: true,
  stripeRefundId: true,
  stripeCreditNoteId: true,
  stripeInvoiceId: true,
  stripePaymentIntentId: true,
  stripeCheckoutSessionId: true,
  subscriptionId: true,
  member: { select: { id: true, firstName: true, lastName: true } },
  refundedBy: { select: { id: true, name: true } },
} satisfies Prisma.PaymentSelect;

export type RefundListItem = Prisma.PaymentGetPayload<{ select: typeof REFUND_LIST_SELECT }>;

/** Cobros sobre los que todavía queda algo por devolver, dentro del ámbito. */
export async function listRefundCandidates(
  orgId: string,
  centerIds?: string[],
  take = 50
): Promise<RefundListItem[]> {
  return prisma.payment.findMany({
    where: { ...scopeWhere(orgId, centerIds), status: "PAID" },
    select: REFUND_LIST_SELECT,
    orderBy: { date: "desc" },
    take,
  });
}

/** Devoluciones ya emitidas, totales o parciales. */
export async function listIssuedRefunds(
  orgId: string,
  centerIds?: string[],
  take = 50
): Promise<RefundListItem[]> {
  return prisma.payment.findMany({
    where: { ...scopeWhere(orgId, centerIds), refundedAt: { not: null } },
    select: REFUND_LIST_SELECT,
    orderBy: { refundedAt: "desc" },
    take,
  });
}

// ---------------------------------------------------------------------------
// Conciliación por webhook
// ---------------------------------------------------------------------------

/** `string | { id }` → `string`. Stripe expande o no según el evento. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * `charge.refunded` · El refund ya se emitió en la cuenta conectada (desde Apta
 * o desde el Dashboard) y Stripe lo confirma.
 *
 * Ojo con la devolución PARCIAL: `charge.amount_refunded` es el ACUMULADO, no
 * el importe de este refund, y `charge.refunded` es `true` solo cuando está
 * devuelto del todo. Un parcial deja `amountCents` intacto, no toca el estado y
 * solo escribe `refundedAmountCents`.
 *
 * Es idempotente y también es de llegada tardía: si la devolución se emitió
 * desde Apta, la fila local ya está escrita y esto no cambia nada. Si se emitió
 * desde el Dashboard de Stripe, esto es lo ÚNICO que la escribe — y entonces no
 * hay autor: `refundedByUserId` se queda en null a propósito, porque inventar
 * uno sería peor que no tenerlo. La traza de quién lo hizo está en Stripe.
 */
export async function reconcileChargeRefunded(
  orgId: string,
  charge: Stripe.Charge
): Promise<ReconcileResult> {
  const payment = await findPaymentForCharge(orgId, charge);
  if (!payment) {
    // Stripe no garantiza el orden de entrega: un `charge.refunded` puede
    // adelantar al `invoice.paid` que crea la fila. Retryable, no no-op.
    return { ok: false, retry: true, error: `Cobro de ${charge.id} aún no existe localmente.` };
  }

  const refundedAmountCents = charge.amount_refunded;
  const alreadyRecorded = payment.refundedAmountCents ?? 0;
  const stripeRefundId = idOf(charge.refunds?.data?.[0] ?? null);

  // Ya conciliado con este mismo acumulado: reentrega o eco de lo que escribió
  // `issueRefund`. Nada que hacer.
  if (alreadyRecorded === refundedAmountCents && (!stripeRefundId || payment.stripeRefundId === stripeRefundId)) {
    return { ok: true };
  }

  // `stripeRefundId` es único en toda la tabla: si otro `Payment` ya lo tiene
  // (conciliación cruzada de un cargo compartido), escribirlo aquí reventaría
  // la unicidad y Stripe reintentaría el evento para siempre.
  const refundIdTaken = stripeRefundId
    ? await prisma.payment.findFirst({
        where: { stripeRefundId, NOT: { id: payment.id } },
        select: { id: true },
      })
    : null;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedAmountCents,
      ...(charge.refunded ? { status: "REFUNDED" as const } : {}),
      ...(payment.refundedAt ? {} : { refundedAt: new Date() }),
      ...(stripeRefundId && !refundIdTaken ? { stripeRefundId } : {}),
    },
  });

  return { ok: true };
}

/**
 * Del cargo de Stripe a la fila local. Tres vías, en orden de fiabilidad:
 *
 *  1. **PaymentIntent** — el cobro de checkout (`recordPendingCheckoutPayment`).
 *  2. **El propio refund** — la devolución emitida desde Apta ya dejó escrito
 *     `stripeRefundId`, así que sirve de enlace para un cargo de suscripción,
 *     donde el `Payment` solo guarda `stripeInvoiceId` y el objeto `Charge` de
 *     esta versión de la API ya no trae la factura.
 *  3. **Balance transaction** — el enganche de HU-ST-23 (P4), único por
 *     organización.
 */
async function findPaymentForCharge(orgId: string, charge: Stripe.Charge) {
  const select = { id: true, refundedAmountCents: true, refundedAt: true, stripeRefundId: true };

  const paymentIntentId = idOf(charge.payment_intent);
  if (paymentIntentId) {
    const byIntent = await prisma.payment.findFirst({ where: { orgId, stripePaymentIntentId: paymentIntentId }, select });
    if (byIntent) return byIntent;
  }

  for (const refund of charge.refunds?.data ?? []) {
    const byRefund = await prisma.payment.findFirst({ where: { orgId, stripeRefundId: refund.id }, select });
    if (byRefund) return byRefund;
  }

  const balanceTransactionId = idOf(charge.balance_transaction);
  if (balanceTransactionId) {
    const byBalance = await prisma.payment.findFirst({ where: { orgId, stripeBalanceTransactionId: balanceTransactionId }, select });
    if (byBalance) return byBalance;
  }

  return null;
}

/**
 * `credit_note.created` / `credit_note.updated` / `credit_note.voided` · Nota de
 * crédito sobre una factura de suscripción, enlazada al `Payment` de esa
 * factura (`stripeCreditNoteId`).
 *
 * `eventType` viene del despachador porque una nota ANULADA no es lo mismo que
 * una emitida: anular una nota de crédito deshace la rectificación, y dejar el
 * enlace puesto haría que la ficha del cobro siguiera enseñando un abono que ya
 * no existe. El objeto por sí solo lo dice en `status`, pero el evento es la
 * señal explícita y es la que S1 dejó pasada.
 */
export async function reconcileCreditNote(
  orgId: string,
  creditNote: Stripe.CreditNote,
  eventType: string
): Promise<ReconcileResult> {
  const invoiceId = idOf(creditNote.invoice);
  if (!invoiceId) return { ok: true };

  const payment = await prisma.payment.findFirst({
    where: { orgId, stripeInvoiceId: invoiceId },
    select: { id: true, amountCents: true, refundedAmountCents: true, refundedAt: true, stripeCreditNoteId: true },
  });
  if (!payment) {
    return { ok: false, retry: true, error: `Factura ${invoiceId} aún no tiene cobro local.` };
  }

  const voided = eventType === "credit_note.voided" || creditNote.status === "void";

  if (voided) {
    // Solo se desenlaza LA nota que estaba enlazada: anular una nota distinta
    // de la que consta no debe borrar el enlace bueno.
    if (payment.stripeCreditNoteId !== creditNote.id) return { ok: true };
    await prisma.payment.update({ where: { id: payment.id }, data: { stripeCreditNoteId: null } });
    return { ok: true };
  }

  // El importe devuelto lo lleva `charge.refunded`, que llega por su cuenta con
  // el acumulado bueno. Aquí solo se enlaza el documento — escribir también el
  // importe desde los dos sitios es cómo se acaba contando dos veces la misma
  // devolución.
  if (payment.stripeCreditNoteId === creditNote.id) return { ok: true };
  await prisma.payment.update({ where: { id: payment.id }, data: { stripeCreditNoteId: creditNote.id } });
  return { ok: true };
}

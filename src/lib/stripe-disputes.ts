import type Stripe from "stripe";
import type { DisputeStatus, Prisma } from "@prisma/client";
import type { ReconcileResult } from "@/lib/member-billing";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce, resolveNotification } from "@/lib/notifications";
import { isLiveKey } from "@/lib/billing-shared";
import { reconcileSepaReturn } from "@/lib/stripe-mandate";

/**
 * HU-ST-21 · Disputas y contracargos visibles (decisión D-S7). **PISTA P2.**
 *
 * Una disputa es dinero que YA salió de la cuenta del gimnasio y que el banco
 * del socio reclama. Tiene una fecha límite dura: pasada sin responder, se
 * pierde sola. Hasta ahora eso solo se veía entrando al Dashboard de Stripe, es
 * decir: no se veía.
 *
 * Lo que hace este módulo son tres cosas, y ninguna más:
 *   1. Guarda la disputa en `PaymentDispute`, enlazada a su cobro.
 *   2. Abre una tarea a DIRECCIÓN con el importe y la fecha límite, y la cierra
 *      cuando la disputa se cierra.
 *   3. Refleja el resultado en el `Payment`.
 *
 * **Alcance de esta fase (D-S7)**: aportar evidencia ENLAZA al Dashboard de
 * Stripe. Apta no se encarga de la subida, y no se amplía por libre — subir
 * evidencia es un flujo con ficheros, plazos y responsabilidad legal propia.
 *
 * Lo que S1 dejó resuelto: la deduplicación por `event.id` (HU-ST-05) y el
 * contrato de reintento (`{ ok: false, retry: true }` → 500 y Stripe reintenta),
 * que es lo correcto cuando el `Payment` del cargo disputado aún no existe.
 */

/**
 * Del `status` de Stripe al enum del esquema.
 *
 * Los estados `warning_*` son avisos tempranos de la red de tarjetas: todavía no
 * hay contracargo, pero el reloj de evidencia ya corre igual, así que se tratan
 * como su equivalente sin aviso. `prevented` es una disputa que Stripe frenó
 * antes de llegar al banco: no hay dinero perdido, se cierra como ganada.
 *
 * `null` = un estado que no conocemos. No se inventa: se deja el que hubiera.
 */
export function mapDisputeStatus(status: Stripe.Dispute.Status): DisputeStatus | null {
  switch (status) {
    case "needs_response":
    case "warning_needs_response":
      return "NEEDS_RESPONSE";
    case "under_review":
    case "warning_under_review":
      return "UNDER_REVIEW";
    case "won":
    case "warning_closed":
    case "prevented":
      return "WON";
    case "lost":
      return "LOST";
    default:
      return null;
  }
}

/** `string | { id }` → `string`. Stripe expande o no según el evento. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** `evidence_details.due_by` viene en segundos, y `0` significa "el banco no admite respuesta". */
function evidenceDeadline(dispute: Stripe.Dispute): Date | null {
  const dueBy = dispute.evidence_details?.due_by;
  return dueBy ? new Date(dueBy * 1000) : null;
}

const DISPUTE_ENTITY = "PaymentDispute";
export const DISPUTE_AUDIT_OPENED = "PAYMENT_DISPUTE_OPENED";
export const DISPUTE_AUDIT_CLOSED = "PAYMENT_DISPUTE_CLOSED";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/**
 * `charge.dispute.created` / `.updated` / `.closed`.
 *
 * Un solo reconciliador para los tres: el objeto `Dispute` ya trae `status` y
 * `amount`, y lo que cambia entre eventos es el efecto lateral (abrir la tarea
 * de dirección vs. resolverla), no la lectura. `eventType` es lo que permite
 * distinguirlos sin adivinar por el estado.
 *
 * El upsert por `(orgId, stripeDisputeId)` es lo que hace el ciclo entero
 * idempotente: los tres eventos escriben la misma fila, y una reentrega de
 * cualquiera de ellos no crea una segunda disputa ni una segunda tarea.
 */
export async function reconcileDispute(
  orgId: string,
  dispute: Stripe.Dispute,
  eventType: string
): Promise<ReconcileResult> {
  // HU-ST-12 (pista P1) · Una disputa sobre un cobro SEPA es la otra cara de la
  // devolución bancaria: el dinero se retiene y el socio deja de estar al
  // corriente. Se conserva tal cual —va DELANTE y no sustituye a nada—, porque
  // el resto del ciclo (tarea de dirección, evidencia, cierre) es HU-ST-21 y
  // sigue teniendo que ocurrir para una disputa SEPA igual que para una de
  // tarjeta: el socio queda moroso Y alguien tiene que responderla.
  if (eventType === "charge.dispute.created" && isSepaDispute(dispute)) {
    const result = await reconcileSepaReturn({
      orgId,
      chargeId: typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
      paymentIntentId:
        typeof dispute.payment_intent === "string" ? dispute.payment_intent : (dispute.payment_intent?.id ?? null),
      amountCents: dispute.amount,
      outcome: "FAILED",
      reason: "DISPUTE",
    });
    if (!result.ok) return result;
  }

  const payment = await findPaymentForDispute(orgId, dispute);
  if (!payment) {
    // Stripe no garantiza el orden: la disputa de un cobro que aún no se ha
    // conciliado localmente es reintentable, no un evento que dar por bueno.
    return { ok: false, retry: true, error: `Cargo disputado en ${dispute.id} aún no existe localmente.` };
  }

  const status = mapDisputeStatus(dispute.status);
  const closed = eventType === "charge.dispute.closed" || status === "WON" || status === "LOST";
  const evidenceDueBy = evidenceDeadline(dispute);

  const existing = await prisma.paymentDispute.findUnique({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: dispute.id } },
    select: { id: true, status: true, closedAt: true },
  });

  const row = await prisma.paymentDispute.upsert({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: dispute.id } },
    create: {
      orgId,
      paymentId: payment.id,
      stripeDisputeId: dispute.id,
      amountCents: dispute.amount,
      reason: dispute.reason ?? null,
      ...(status ? { status } : {}),
      evidenceDueBy,
      closedAt: closed ? new Date() : null,
    },
    update: {
      amountCents: dispute.amount,
      reason: dispute.reason ?? null,
      ...(status ? { status } : {}),
      evidenceDueBy,
      // `closedAt` se escribe UNA vez: un `updated` que llegue tarde, después
      // del `closed`, no puede reabrir una disputa ya cerrada ni mover su fecha.
      ...(closed && !existing?.closedAt ? { closedAt: new Date() } : {}),
    },
    select: { id: true, amountCents: true, status: true },
  });

  if (closed) {
    await closeDisputeTask(orgId, row.id);
    await reflectOutcomeOnPayment(payment, row.amountCents, row.status, dispute.id);
    if (!existing?.closedAt) {
      await writeDisputeAudit(orgId, payment, row.id, DISPUTE_AUDIT_CLOSED, {
        disputeId: dispute.id,
        resultado: row.status,
        amountCents: row.amountCents,
      });
    }
    return { ok: true };
  }

  // Abierta: la tarea es lo que hace que alguien la mire a tiempo.
  await openDisputeTask(orgId, payment, row.id, row.amountCents, dispute, evidenceDueBy);
  if (!existing) {
    await writeDisputeAudit(orgId, payment, row.id, DISPUTE_AUDIT_OPENED, {
      disputeId: dispute.id,
      amountCents: row.amountCents,
      motivo: dispute.reason ?? null,
      evidenceDueBy: evidenceDueBy?.toISOString() ?? null,
    });
  }

  return { ok: true };
}

type DisputedPayment = { id: string; memberId: string; amountCents: number; refundedAmountCents: number | null };

/**
 * Del objeto `Dispute` a la fila local, en orden de fiabilidad:
 *
 *  1. **La disputa que ya conocemos** — para `updated` y `closed`, el enlace ya
 *     está guardado y no depende de que Stripe expanda nada.
 *  2. **PaymentIntent** — el cobro de checkout.
 *  3. **Balance transaction del cargo** — el enganche de HU-ST-23 (P4).
 */
async function findPaymentForDispute(orgId: string, dispute: Stripe.Dispute): Promise<DisputedPayment | null> {
  const select = { id: true, memberId: true, amountCents: true, refundedAmountCents: true };

  const known = await prisma.paymentDispute.findUnique({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: dispute.id } },
    select: { payment: { select } },
  });
  if (known) return known.payment;

  const paymentIntentId = idOf(dispute.payment_intent);
  if (paymentIntentId) {
    const byIntent = await prisma.payment.findFirst({ where: { orgId, stripePaymentIntentId: paymentIntentId }, select });
    if (byIntent) return byIntent;
  }

  const balanceTransactionId = idOf(dispute.balance_transactions?.[0]?.source ?? null);
  if (balanceTransactionId) {
    const byBalance = await prisma.payment.findFirst({
      where: { orgId, stripeBalanceTransactionId: balanceTransactionId },
      select,
    });
    if (byBalance) return byBalance;
  }

  return null;
}

/**
 * Escenario "disputa abierta": una tarea para DIRECCIÓN con importe y
 * `evidence_details.due_by`.
 *
 * Dirección y no recepción, y no es una preferencia de estilo: responder una
 * disputa es decidir si se aporta evidencia o se asume la pérdida, con dinero y
 * un plazo legal de por medio. La dirección de ORGANIZACIÓN la recibe siempre;
 * la de CENTRO, solo si el socio es de uno de sus centros — el mismo criterio
 * que las alertas de faltas (`no-show-alerts.ts`), para que el nombre de un
 * socio no cruce la frontera entre centros.
 *
 * `createNotificationOnce` está por el ciclo de vida: `charge.dispute.updated`
 * llega varias veces y cada una volvería a abrir la misma tarea.
 */
async function openDisputeTask(
  orgId: string,
  payment: DisputedPayment,
  disputeId: string,
  amountCents: number,
  dispute: Stripe.Dispute,
  evidenceDueBy: Date | null
) {
  const member = await prisma.member.findUnique({
    where: { id: payment.memberId },
    select: { firstName: true, lastName: true, primaryCenterId: true },
  });
  if (!member) return;

  const recipients = await prisma.user.findMany({
    where: {
      orgId,
      deactivatedAt: null,
      OR: [
        { role: "OWNER" },
        ...(member.primaryCenterId
          ? [
              {
                role: "CENTER_DIRECTOR" as const,
                OR: [
                  { centerId: member.primaryCenterId },
                  { centerMemberships: { some: { centerId: member.primaryCenterId } } },
                ],
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });

  const plazo = evidenceDueBy
    ? `Hay que responder antes del ${evidenceDueBy.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}: pasada esa fecha, la disputa se pierde sola.`
    : "El banco de este socio no admite respuesta a esta disputa.";

  for (const recipient of recipients) {
    await createNotificationOnce({
      orgId,
      recipientUserId: recipient.id,
      kind: "TASK",
      priority: "ALTA",
      category: "Cobros",
      title: `Disputa de ${euros(amountCents)} · ${member.firstName} ${member.lastName}`,
      body: `Motivo declarado por el banco: ${dispute.reason ?? "sin especificar"}. ${plazo} La evidencia se aporta desde el Dashboard de Stripe (Apta enlaza, no sube los ficheros).`,
      entityType: DISPUTE_ENTITY,
      entityId: disputeId,
      ...(evidenceDueBy ? { dueDate: evidenceDueBy } : {}),
    });
  }
}

/** Escenario "resolución": cerrada la disputa, la tarea deja de tener trabajo detrás. */
async function closeDisputeTask(orgId: string, disputeId: string) {
  const abiertas = await prisma.notification.findMany({
    where: { orgId, entityType: DISPUTE_ENTITY, entityId: disputeId, resolvedAt: null },
    select: { id: true, recipientUserId: true },
  });
  for (const tarea of abiertas) {
    // `anyRecipient`: la cierra el evento, no su destinatario.
    await resolveNotification(orgId, tarea.recipientUserId, tarea.id, { anyRecipient: true });
  }
}

/**
 * Escenario "resolución": **el `Payment` refleja el resultado**.
 *
 * Ganada, el cobro no se toca: el dinero se queda donde estaba.
 *
 * Perdida, el dinero NO está. Dejar la fila en PAID hace que toda cifra de
 * ingresos del gimnasio —el panel, los informes, el ranking de ventas— cuente
 * un cobro que el banco ya se llevó. `PaymentStatus` no tiene un estado propio
 * para el contracargo y el esquema está congelado este trimestre, así que se usa
 * el único que dice la verdad contable: REFUNDED, con el importe de la disputa
 * y un motivo que deja claro que fue un contracargo y no una devolución.
 *
 * `stripeRefundId` se queda en NULL, y eso es lo que distingue los dos casos en
 * la ficha: un contracargo no tiene refund detrás, y la fila de `PaymentDispute`
 * es donde está su historia completa.
 */
async function reflectOutcomeOnPayment(
  payment: DisputedPayment,
  amountCents: number,
  status: DisputeStatus,
  stripeDisputeId: string
) {
  if (status !== "LOST") return;

  const yaDevuelto = payment.refundedAmountCents ?? 0;
  // Un cobro parcialmente devuelto y luego disputado no puede "devolver" más de
  // lo que se cobró.
  const total = Math.min(payment.amountCents, yaDevuelto + amountCents);

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "REFUNDED",
      refundedAmountCents: total,
      refundedAt: new Date(),
      refundReason: `Contracargo perdido (disputa ${stripeDisputeId})`,
    },
  });
}

/**
 * Traza de la disputa en `AuditLog`. Sin autor —no lo hay: la abre el banco del
 * socio y la cierra la red de tarjetas— pero con todo lo demás, que es lo que
 * permite reconstruir después por qué un cobro dejó de estar cobrado.
 */
async function writeDisputeAudit(
  orgId: string,
  payment: DisputedPayment,
  disputeId: string,
  action: string,
  metadata: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: {
      orgId,
      action,
      entityType: DISPUTE_ENTITY,
      entityId: disputeId,
      memberId: payment.memberId,
      metadata: { paymentId: payment.id, ...(metadata as object) },
    },
  });
}

// ---------------------------------------------------------------------------
// Lectura para la pantalla `/billing/disputas`
// ---------------------------------------------------------------------------

const DISPUTE_LIST_SELECT = {
  id: true,
  stripeDisputeId: true,
  amountCents: true,
  reason: true,
  status: true,
  evidenceDueBy: true,
  openedAt: true,
  closedAt: true,
  payment: {
    select: {
      id: true,
      amountCents: true,
      date: true,
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.PaymentDisputeSelect;

export type DisputeListItem = Prisma.PaymentDisputeGetPayload<{ select: typeof DISPUTE_LIST_SELECT }>;

/**
 * Disputas de la organización, acotadas al ámbito de centro de quien pregunta.
 *
 * `centerIds === undefined` es "sin frontera" (dirección de organización);
 * presente —aunque venga vacío— manda siempre. Mismo contrato que
 * `billing-queries.ts`: una disputa de otro centro no se ve.
 *
 * Orden: primero lo que corre. Las abiertas por fecha límite ascendente —la que
 * vence mañana arriba— y las cerradas después.
 */
export async function listDisputes(orgId: string, centerIds?: string[]): Promise<DisputeListItem[]> {
  return prisma.paymentDispute.findMany({
    where: {
      orgId,
      ...(centerIds !== undefined ? { payment: { member: { primaryCenterId: { in: centerIds } } } } : {}),
    },
    select: DISPUTE_LIST_SELECT,
    orderBy: [{ closedAt: "asc" }, { evidenceDueBy: "asc" }, { openedAt: "desc" }],
  });
}

/**
 * Escenario "aportar evidencia": **en esta fase se ENLAZA al Dashboard de
 * Stripe**, no se delega la subida en Apta (D-S7).
 *
 * La cuenta va en la ruta porque es la del gimnasio (Connect Standard), no la de
 * Apta: sin ella el enlace abre el Dashboard de la plataforma, donde esa disputa
 * no existe. El segmento `/test/` sale del prefijo de la clave, igual que el
 * distintivo TEST/LIVE de HU-ST-24, porque en modo prueba el Dashboard sirve las
 * disputas por otra URL y el enlace bueno para producción da 404 allí.
 */
export function stripeDisputeUrl(accountId: string, stripeDisputeId: string, live = isLiveKey(process.env.STRIPE_SECRET_KEY)) {
  return `https://dashboard.stripe.com/${accountId}${live ? "" : "/test"}/disputes/${stripeDisputeId}`;
}

/**
 * ¿La disputa es sobre un adeudo SEPA? `payment_method_details` de la disputa
 * lleva el instrumento del cargo original; sin él no se puede afirmar, y
 * tratarlo como SEPA marcaría moroso a quien hizo un contracargo de tarjeta
 * antes de que HU-ST-21 decida qué hacer con él.
 */
function isSepaDispute(dispute: Stripe.Dispute): boolean {
  return dispute.payment_method_details?.type === "sepa_debit";
}

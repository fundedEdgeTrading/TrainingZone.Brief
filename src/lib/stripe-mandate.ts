import type Stripe from "stripe";
import type { SepaMandateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { stripeReadClient } from "@/lib/billing-shared";
import { renderSepaMandateConfirmationEmail } from "@/lib/emails/templates";
import { absoluteUrl, publicOrigin } from "@/lib/site";
import { openDelinquency } from "@/lib/stripe-dunning";
// Solo el TIPO: un import de valor desde `member-billing` cerraría un ciclo con
// el que ya tiene este módulo por el otro lado.
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-12 · SEPA Direct Debit con mandato. **PISTA P1.**
 *
 * El agujero que cierra la historia: SEPA estaba **declarado pero no
 * soportado** —`payment_method_types` lo incluía, pero sin ningún manejo de su
 * asincronía—, así que un débito devuelto a las semanas no producía NINGÚN
 * efecto en Apta.
 *
 * Lo que un adeudo directo tiene y una tarjeta no:
 *   1. **Un mandato.** El socio autoriza por escrito a cargar en su cuenta, y el
 *      esquema obliga a poder acreditarlo y a confirmárselo. Vive en
 *      `SepaMandate` (referencia UMR, últimos 4 del IBAN, estado, aceptación).
 *   2. **Días de retraso.** El cobro no se sabe si ha entrado hasta pasados
 *      varios días hábiles. Stripe da por buena la suscripción mucho antes de
 *      que el dinero se mueva.
 *   3. **Devolución a posteriori** (R-transaction). Hasta 8 semanas después de
 *      un cargo ya conciliado, el banco puede devolverlo sin dar motivo.
 *
 * `RB-PAGO-025` — **un cobro asíncrono no da acceso hasta liquidar**. El motor
 * de reservas filtra por `Subscription.status === "ACTIVE"`, así que dejar la
 * suscripción en `PENDING_CONFIRMATION` es lo que corta el acceso; ponerla
 * ACTIVE "provisionalmente" mientras el débito está en vuelo es exactamente lo
 * que la regla prohíbe.
 */

// ---------------------------------------------------------------------------
// El freno de RB-PAGO-025: la marca de "cobro asíncrono en vuelo"
// ---------------------------------------------------------------------------
//
// Stripe NO garantiza el orden de entrega de los eventos, y para una
// suscripción cobrada por adeudo directo manda `customer.subscription.created`
// con `status: "active"` mientras el dinero todavía no se ha movido. Si el
// único criterio fuera ese estado, el acceso se abriría igual con el débito en
// vuelo — y luego habría que quitarlo.
//
// La marca es un apunte en `AuditLog` (append-only, sin columna nueva: el
// esquema está congelado este trimestre) y es idempotente por naturaleza: lo
// que vale es el ÚLTIMO apunte de esa suscripción. Así da igual el orden en que
// lleguen los eventos.

const ASYNC_ENTITY = "SepaAsyncSettlement";
const ASYNC_HOLD_ACTION = "SEPA_ASYNC_HOLD";
const ASYNC_SETTLED_ACTION = "SEPA_ASYNC_SETTLED";

/** Mandato · sello del correo de confirmación, para no mandarlo dos veces. */
const MANDATE_ENTITY = "SepaMandate";
const MANDATE_CONFIRMED_ACTION = "SEPA_MANDATE_CONFIRMED";

/**
 * ¿Esta sesión de checkout se ha completado **sin que el dinero se haya
 * movido**? Es la firma de un método de pago de notificación diferida: el socio
 * ha terminado el checkout y ha firmado el mandato, pero el adeudo tardará días
 * en liquidarse y puede no llegar a hacerlo.
 *
 * `payment_status` es el campo que lo dice, y no `status`: una sesión asíncrona
 * llega como `complete` + `unpaid`. `no_payment_required` (importe cero, prueba
 * gratuita) sí está liquidada: no hay nada que esperar.
 */
export function isAsyncPaymentPending(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" && session.payment_status === "unpaid";
}

/** `sub_…` de la sesión, o `null` si el checkout no abrió suscripción. */
function sessionSubscriptionId(session: Stripe.Checkout.Session): string | null {
  return typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
}

/**
 * La clave de la marca: la suscripción si la hay, y si no la propia sesión de
 * checkout (bono puntual pagado por adeudo directo).
 */
function asyncHoldKey(session: Stripe.Checkout.Session): string {
  return sessionSubscriptionId(session) ?? session.id;
}

/** ¿Hay un cobro asíncrono en vuelo para esta suscripción (o sesión)? */
export async function isAwaitingAsyncSettlement(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  const last = await prisma.auditLog.findFirst({
    where: { entityType: ASYNC_ENTITY, entityId: key },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  return last?.action === ASYNC_HOLD_ACTION;
}

/**
 * `checkout.session.completed` con el pago SIN liquidar. Deja la marca y baja
 * la suscripción local —si ya existe— a `PENDING_CONFIRMATION`.
 *
 * Lo llama `reconcileConnectCheckoutCompleted` ANTES de su camino normal: para
 * un adeudo en vuelo no se puede marcar el `Payment` como PAID ni crear el bono,
 * que es justo lo que abriría el acceso sin haber cobrado.
 */
export async function holdAsyncCheckout(orgId: string, session: Stripe.Checkout.Session): Promise<void> {
  const key = asyncHoldKey(session);
  if (await isAwaitingAsyncSettlement(key)) return; // reentrega del mismo evento

  await prisma.auditLog.create({
    data: {
      orgId,
      action: ASYNC_HOLD_ACTION,
      entityType: ASYNC_ENTITY,
      entityId: key,
      memberId: session.metadata?.memberId ?? null,
      metadata: {
        checkoutSessionId: session.id,
        mode: session.mode ?? null,
        amountTotal: session.amount_total ?? null,
      },
    },
  });

  const stripeSubscriptionId = sessionSubscriptionId(session);
  if (stripeSubscriptionId) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId, member: { orgId }, status: { in: ["ACTIVE", "FROZEN"] } },
      data: { status: "PENDING_CONFIRMATION" },
    });
  }
}

/** El adeudo ha liquidado (o ha fallado): se levanta la marca. */
export async function releaseAsyncHold(orgId: string, key: string, settled: boolean): Promise<void> {
  if (!(await isAwaitingAsyncSettlement(key))) return;
  await prisma.auditLog.create({
    data: {
      orgId,
      action: ASYNC_SETTLED_ACTION,
      entityType: ASYNC_ENTITY,
      entityId: key,
      metadata: { settled },
    },
  });
}

/**
 * RB-PAGO-025 aplicado al mapeo de estados: con un cobro asíncrono en vuelo,
 * "activa en Stripe" NO es "activa en Apta".
 *
 * Pura a propósito: es la regla que decide si se abre el acceso, y tiene que
 * poder probarse sin base de datos ni webhooks.
 */
export function holdAsyncSubscriptionStatus<T extends string>(
  mappedStatus: T,
  awaitingSettlement: boolean
): T | "PENDING_CONFIRMATION" {
  if (!awaitingSettlement) return mappedStatus;
  // Solo se frena la apertura de acceso. Si Stripe ya dice CANCELLED o EXPIRED,
  // eso manda: son estados terminales y taparlos con "pendiente" mentiría.
  return mappedStatus === "ACTIVE" ? "PENDING_CONFIRMATION" : mappedStatus;
}

// ---------------------------------------------------------------------------
// El mandato
// ---------------------------------------------------------------------------

/**
 * `Stripe.Mandate.status` → `SepaMandateStatus`. `inactive` es el estado con el
 * que Stripe marca tanto el mandato revocado por el socio como el caducado por
 * desuso (18 meses del esquema): los dos dejan de autorizar cobros, que es lo
 * único que aquí cambia.
 */
export function mapMandateStatus(status: Stripe.Mandate.Status): SepaMandateStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "inactive":
      return "INACTIVE";
    case "pending":
    default:
      return "PENDING";
  }
}

/**
 * Datos del método de pago que el propio evento NO trae: el `Mandate` de Stripe
 * lleva la referencia del mandato, pero el cliente y los últimos 4 del IBAN
 * viven en el `PaymentMethod`.
 *
 * Se inyecta para poder probar el reconciliador sin una cuenta conectada: el
 * entorno de CI corre a propósito sin `STRIPE_SECRET_KEY`.
 */
export type PaymentMethodLookup = (
  paymentMethodId: string
) => Promise<{ customerId: string | null; last4: string | null } | null>;

const defaultLookup =
  (orgId: string): PaymentMethodLookup =>
  async (paymentMethodId) => {
    // Lectura, no escritura: `stripeReadClient` no exige `chargesEnabled`, y
    // un mandato puede actualizarse (revocarse, sobre todo) después de que el
    // gimnasio haya dejado de poder cobrar.
    const client = await stripeReadClient(orgId);
    if (!client.ok) return null;
    try {
      // La cuenta conectada va en las opciones de petición (tercer argumento),
      // no en los parámetros: es la cabecera `Stripe-Account`.
      const pm = await client.stripe.paymentMethods.retrieve(paymentMethodId, undefined, {
        stripeAccount: client.accountId,
      });
      const customerId = typeof pm.customer === "string" ? pm.customer : (pm.customer?.id ?? null);
      return { customerId, last4: pm.sepa_debit?.last4 ?? null };
    } catch (e) {
      console.error("[stripe-mandate] no se ha podido leer el método de pago del mandato", {
        orgId,
        paymentMethodId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  };

function mandatePaymentMethodId(mandate: Stripe.Mandate): string | null {
  return typeof mandate.payment_method === "string" ? mandate.payment_method : (mandate.payment_method?.id ?? null);
}

/**
 * `mandate.updated` · El banco confirma, revoca o deja caducar el mandato.
 *
 * Un mandato revocado **no se borra**: hay cobros ya conciliados que lo citan
 * como la autorización con la que se hicieron, y el esquema SEPA obliga a poder
 * enseñarla. Se marca INACTIVE con su `revokedAt`.
 */
export async function reconcileMandateUpdated(
  orgId: string,
  mandate: Stripe.Mandate,
  lookup?: PaymentMethodLookup
): Promise<ReconcileResult> {
  const sepa = mandate.payment_method_details?.sepa_debit;
  // Solo los mandatos de adeudo directo: un mandato de tarjeta (Stripe también
  // los emite) no tiene ni IBAN ni referencia que enseñar.
  if (!sepa) return { ok: true };

  const existing = await prisma.sepaMandate.findUnique({
    where: { orgId_stripeMandateId: { orgId, stripeMandateId: mandate.id } },
    select: { id: true, memberId: true, status: true, ibanLast4: true },
  });

  const pmId = mandatePaymentMethodId(mandate);
  const details = pmId ? await (lookup ?? defaultLookup(orgId))(pmId) : null;

  let memberId = existing?.memberId ?? null;
  if (!memberId && details?.customerId) {
    const member = await prisma.member.findFirst({
      where: { orgId, stripeCustomerId: details.customerId },
      select: { id: true },
    });
    memberId = member?.id ?? null;
  }
  // Mandato de un cliente que no reconocemos (cuenta de pruebas, socio borrado):
  // se descarta sin escribir, igual que un evento de una cuenta conectada que no
  // está en nuestra base. No es un fallo, así que no se reintenta.
  if (!memberId) return { ok: true };

  const status = mapMandateStatus(mandate.status);
  const acceptedAtSeconds = mandate.customer_acceptance?.accepted_at ?? null;
  const acceptedAt = acceptedAtSeconds ? new Date(acceptedAtSeconds * 1000) : null;
  // Los últimos 4 no se pierden nunca: si esta lectura no los trae (Stripe
  // inaccesible), se conserva lo que ya había.
  const ibanLast4 = details?.last4 ?? existing?.ibanLast4 ?? "";

  const mandateRow = await prisma.sepaMandate.upsert({
    where: { orgId_stripeMandateId: { orgId, stripeMandateId: mandate.id } },
    create: {
      orgId,
      memberId,
      stripeMandateId: mandate.id,
      reference: sepa.reference ?? mandate.id,
      ibanLast4,
      status,
      acceptedAt,
      revokedAt: status === "INACTIVE" ? new Date() : null,
    },
    update: {
      reference: sepa.reference ?? undefined,
      ...(details?.last4 ? { ibanLast4: details.last4 } : {}),
      status,
      ...(acceptedAt ? { acceptedAt } : {}),
      // Se sella la revocación la primera vez que se ve, y no se vuelve a mover.
      ...(status === "INACTIVE" && existing?.status !== "INACTIVE" ? { revokedAt: new Date() } : {}),
    },
    select: { id: true, reference: true, ibanLast4: true },
  });

  // El mandato autoriza a domiciliar ESTA suscripción, y por eso la referencia
  // cuelga de la suscripción y no solo del socio: un socio que firma un mandato
  // nuevo (cambio de cuenta) no puede dejar sin autorización acreditable a los
  // cobros que ya se hicieron con el anterior.
  if (status !== "INACTIVE") {
    await prisma.subscription.updateMany({
      where: {
        memberId,
        stripeSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "PENDING_CONFIRMATION", "FROZEN", "PAUSED"] },
      },
      data: { sepaMandateId: mandateRow.id },
    });
  }

  if (status === "ACTIVE") {
    await sendMandateConfirmationOnce(orgId, memberId, mandate.id, mandateRow.reference, mandateRow.ibanLast4);
  }

  return { ok: true };
}

/**
 * La confirmación de mandato que exige el esquema SEPA: el deudor tiene que
 * recibir por escrito la referencia con la que se le va a domiciliar. Una sola
 * vez por mandato — el sello va en `AuditLog`, mismo patrón que
 * `sendDunningNoticeOnce`, porque la fila del mandato se actualiza en cada
 * evento y no sirve de marca de "ya avisado".
 */
async function sendMandateConfirmationOnce(
  orgId: string,
  memberId: string,
  stripeMandateId: string,
  reference: string,
  ibanLast4: string
): Promise<void> {
  const already = await prisma.auditLog.findFirst({
    where: { entityType: MANDATE_ENTITY, entityId: stripeMandateId, action: MANDATE_CONFIRMED_ACTION },
    select: { id: true },
  });
  if (already) return;

  const [org, member] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.member.findFirst({
      where: { id: memberId, orgId },
      select: {
        firstName: true,
        email: true,
        user: { select: { email: true } },
        primaryCenter: { select: { address: true } },
      },
    }),
  ]);
  const to = member?.user?.email ?? member?.email;
  if (!member || !to) return;

  await prisma.auditLog.create({
    data: {
      orgId,
      action: MANDATE_CONFIRMED_ACTION,
      entityType: MANDATE_ENTITY,
      entityId: stripeMandateId,
      memberId,
      metadata: { reference, ibanLast4 },
    },
  });

  const brandName = org?.name ?? "Training Zone";
  // Correo de SERVICIO, como el preaviso: el esquema obliga a confirmar el
  // mandato, así que no puede llevar enlace de baja.
  void sendMail({
    to,
    fromName: brandName,
    subject: "Tu domiciliación está activa",
    html: renderSepaMandateConfirmationEmail({
      memberFirstName: member.firstName,
      brandName,
      brandLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      mandateReference: reference,
      ibanLast4,
      portalUrl: `${publicOrigin()}/portal/membresia`,
      postalAddress: member.primaryCenter.address ?? undefined,
    }),
  });
}

// ---------------------------------------------------------------------------
// El desenlace del primer cobro asíncrono
// ---------------------------------------------------------------------------

/**
 * `checkout.session.async_payment_succeeded` / `checkout.session.async_payment_failed`
 * · El desenlace del primer cobro por adeudo directo, que llega días después
 * del checkout.
 *
 *   · succeeded → se levanta el freno, la suscripción sale de
 *     PENDING_CONFIRMATION y el bono puntual se crea AHORA (no antes).
 *   · failed    → el `Payment` queda FAILED y arranca el dunning (HU-ST-18).
 */
export async function reconcileAsyncPayment(
  orgId: string,
  session: Stripe.Checkout.Session,
  eventType: string
): Promise<ReconcileResult> {
  const succeeded = eventType === "checkout.session.async_payment_succeeded";
  const stripeSubscriptionId = sessionSubscriptionId(session);
  const key = asyncHoldKey(session);

  if (succeeded) {
    if (stripeSubscriptionId) {
      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
        select: { id: true, member: { select: { orgId: true } } },
      });
      // Stripe no garantiza el orden: si el `customer.subscription.created` que
      // crea la fila local todavía no ha llegado, esto es retryable y no un
      // no-op. Dar el evento por consumido dejaría la suscripción sin activar.
      if (!subscription) {
        return { ok: false, retry: true, error: `Suscripción ${stripeSubscriptionId} aún no existe localmente.` };
      }
      if (subscription.member.orgId !== orgId) return { ok: true }; // aislamiento
      await releaseAsyncHold(orgId, key, true);
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE" } });
      return { ok: true };
    }

    // Bono puntual: el camino normal del checkout (marcar el `Payment` PAID y
    // crear el bono) es exactamente lo que había que aplazar, así que se ejecuta
    // ahora tal cual. Import dinámico para no cerrar un ciclo de módulos:
    // `stripe-checkout` importa de `member-billing`, que importa de aquí.
    await releaseAsyncHold(orgId, key, true);
    const { reconcileConnectCheckoutCompleted } = await import("@/lib/stripe-checkout");
    await reconcileConnectCheckoutCompleted(orgId, session);
    return { ok: true };
  }

  // ----- El adeudo no ha llegado a cargarse -----
  await releaseAsyncHold(orgId, key, false);

  const amountCents = session.amount_total ?? 0;
  let memberId = session.metadata?.memberId ?? null;

  const payment = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    select: { id: true, memberId: true, orgId: true },
  });
  if (payment) {
    if (payment.orgId !== orgId) return { ok: true }; // aislamiento
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    memberId = payment.memberId;
  }

  if (stripeSubscriptionId) {
    const subscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { id: true, memberId: true, member: { select: { orgId: true } } },
    });
    if (subscription && subscription.member.orgId === orgId) {
      // Sigue sin liquidar y ya se sabe que no va a liquidar: no es "pendiente
      // de confirmación", es un impago.
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "FROZEN" } });
      memberId = subscription.memberId;
    }
  }

  if (!memberId) return { ok: true };
  await openDelinquency({
    orgId,
    memberId,
    noticeKey: session.id,
    amountCents,
    reason: "SEPA_ASYNC_FAILED",
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// La devolución bancaria posterior (R-transaction)
// ---------------------------------------------------------------------------

/**
 * Un adeudo YA conciliado que el banco devuelve semanas después. Es lo que
 * distingue a SEPA de una tarjeta: el socio puede pedir la devolución durante 8
 * semanas sin dar motivo, y el dinero sale de la cuenta del gimnasio cuando ya
 * nadie estaba mirando ese cobro.
 *
 * `outcome` distingue las dos formas en que llega:
 *   · `REFUNDED` — `charge.refunded` sobre un cobro SEPA: el dinero se devolvió.
 *   · `FAILED`   — `charge.dispute.created`: el banco lo reclama y lo retiene.
 *
 * Lo llaman los reconciliadores de HU-ST-20 y HU-ST-21 (pista P2), que son los
 * que reciben esos dos eventos. El efecto de morosidad es el mismo y por eso
 * vive aquí y no duplicado en los dos.
 */
export async function reconcileSepaReturn(params: {
  orgId: string;
  /** `ch_…` del cargo devuelto. Es la clave del aviso cuando no hay factura. */
  chargeId: string;
  paymentIntentId?: string | null;
  amountCents: number;
  outcome: "REFUNDED" | "FAILED";
  reason: "SEPA_RETURNED" | "DISPUTE";
}): Promise<ReconcileResult> {
  const { orgId, chargeId, paymentIntentId, amountCents, outcome, reason } = params;

  const payment = paymentIntentId
    ? await prisma.payment.findFirst({
        where: { orgId, stripePaymentIntentId: paymentIntentId },
        select: { id: true, memberId: true, status: true },
      })
    : null;

  // Sin el cobro local no hay a quién marcar moroso, y el orden de entrega no
  // está garantizado: se reintenta en vez de darlo por consumido.
  if (!payment) {
    return { ok: false, retry: true, error: `El cobro ${chargeId} aún no existe localmente.` };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: outcome,
      ...(outcome === "REFUNDED"
        ? { refundedAt: new Date(), refundedAmountCents: amountCents, refundReason: "Devolución bancaria (SEPA)" }
        : {}),
    },
  });

  await openDelinquency({ orgId, memberId: payment.memberId, noticeKey: chargeId, amountCents, reason });
  return { ok: true };
}

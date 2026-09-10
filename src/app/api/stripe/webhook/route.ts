import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { hasAnyWebhookSecret, readWebhookSecrets, verifyStripeWebhook } from "@/lib/stripe-webhook";
import { reconcileConnectCheckoutCompleted, reconcileStripePaymentFailed } from "@/lib/stripe-checkout";
import {
  reconcileMemberSubscriptionUpserted,
  reconcileMemberSubscriptionDeleted,
  reconcileMemberInvoicePaid,
  reconcileMemberInvoicePaymentFailed,
} from "@/lib/member-billing";
import { prisma } from "@/lib/prisma";
import { deauthorizeStripeAccount, refreshStripeAccountStatus } from "@/lib/stripe-connect";
import { applyPlanChangeFromCheckout, provisionOrganizationFromCheckout } from "@/lib/provisioning";
import { reconcilePlatformInvoicePaid, reconcilePlatformInvoicePaymentFailed } from "@/lib/platform-billing";
import { claimStripeEvent, markStripeEventFailed, markStripeEventProcessed } from "@/lib/stripe-webhook-events";
// Lote 2 · Los seis módulos de abajo los cablea S1 de una vez y los rellena
// cada pista por separado (P1, P2, P4). Hoy registran el evento y devuelven ok:
// el `switch` ya no hay que volver a tocarlo.
import { reconcileChargeRefunded, reconcileCreditNote } from "@/lib/stripe-refunds";
import { reconcileDispute } from "@/lib/stripe-disputes";
import { reconcilePayout } from "@/lib/stripe-balance";
import { reconcileAsyncPayment, reconcileMandateUpdated } from "@/lib/stripe-mandate";
import { sendSepaPrenotification } from "@/lib/sepa-prenotification";
import { reconcileCardExpiry } from "@/lib/stripe-card-expiry";

/**
 * F12/RB-PAGO-002 + Parte A.4/C.4. Un único endpoint para los dos planos de
 * cobro (§0): los eventos de cuentas CONECTADAS (Parte C, gimnasio → socios)
 * llegan con `event.account` presente; los de PLATAFORMA (Apta → gimnasio,
 * Parte A) llegan sin él. Se rutan por separado para no mezclarlos.
 *
 * HU-ST-01/RB-PAGO-020: cada uno de los dos flujos se firma con su propio
 * signing secret (`STRIPE_WEBHOOK_SECRET` y `STRIPE_CONNECT_WEBHOOK_SECRET`).
 * La verificación y el enrutado viven en `lib/stripe-webhook.ts`.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const secrets = readWebhookSecrets();
  if (!stripe || !hasAnyWebhookSecret(secrets)) {
    return NextResponse.json({ ok: false, error: "Stripe no está configurado en este entorno." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ ok: false, error: "Falta la firma de Stripe." }, { status: 400 });

  // HU-ST-01/RB-PAGO-020: los eventos de plataforma y los de cuentas conectadas
  // llegan firmados con secretos DISTINTOS. Verificar con uno solo condenaba a
  // 400 a todo un flujo.
  const verified = verifyStripeWebhook(stripe, rawBody, signature, secrets);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
  }
  const { event } = verified;

  // HU-ST-05/RB-PAGO-023: Stripe entrega AL MENOS una vez. La marca por
  // `event.id` es la única idempotencia transversal; sin ella cada
  // reconciliador tenía que defenderse solo, y los que no lo hacían duplicaban.
  const claim = await claimStripeEvent(event);
  if (!claim.claimed) {
    // 200: para Stripe está consumido. Repetirlo no aporta nada y reprocesarlo
    // sí puede escribir dinero dos veces.
    return NextResponse.json({ ok: true, deduplicated: claim.reason });
  }

  const result =
    verified.source === "connect" ? await handleConnectEvent(event) : await handlePlatformEvent(event);

  if (!result.ok) {
    // 500 a propósito: Stripe reintenta con backoff, y el evento NO queda
    // marcado como procesado. El caso real en Connect es el `invoice.paid` de
    // una suscripción recién creada llegando antes que el
    // `customer.subscription.created` que la crea localmente (Stripe no
    // garantiza el orden); en plataforma, un alta que no llega a completarse y
    // dejaba a un cliente que YA ha pagado sin organización. Antes ambos se
    // tragaban con 200 y el evento se daba por consumido para siempre.
    await markStripeEventFailed(event.id, result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  await markStripeEventProcessed(event.id);
  return NextResponse.json({ ok: true });
}

/**
 * Parte C: eventos de la cuenta conectada de un gimnasio (cobro a socios).
 * F5: los eventos de Stripe Billing resuelven `orgId` desde `StripeAccount`
 * antes de escribir nada — es la frontera de aislamiento del Plano 2. Si la
 * cuenta conectada no está en nuestra base (cuenta huérfana, evento de test
 * de otra org...), se descarta sin más.
 */
type ConnectEventResult = { ok: true } | { ok: false; error: string };

async function handleConnectEvent(event: Stripe.Event): Promise<ConnectEventResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      await reconcileConnectCheckoutCompleted(orgId, session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await reconcileStripePaymentFailed(session.id);
      break;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await refreshStripeAccountStatus(account.id);
      break;
    }
    case "account.application.deauthorized": {
      // HU-ST-06/RB-CONNECT-004: el gimnasio ha revocado el acceso desde su
      // Dashboard. `event.data.object` es la Application, no la cuenta: quien
      // identifica al gimnasio es `event.account`. Tampoco se puede llamar a
      // `accounts.retrieve` (ya no tenemos permiso), así que se apagan los dos
      // interruptores directamente en vez de refrescar desde Stripe.
      await deauthorizeStripeAccount(event.account);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      await reconcileMemberSubscriptionUpserted(orgId, event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      await reconcileMemberSubscriptionDeleted(orgId, event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.paid": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileMemberInvoicePaid(orgId, event.data.object as Stripe.Invoice);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }
    case "invoice.payment_failed": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileMemberInvoicePaymentFailed(orgId, event.data.object as Stripe.Invoice);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    // ----------------------------------------------------------------------
    // Lote 2 · Casos cableados por S1 de una sola vez.
    //
    // Cinco pistas distintas necesitaban añadir casos a este `switch`, y si lo
    // tocaban las cinco chocaban las cinco. Así que están todos aquí desde ya,
    // cada uno delegando en el módulo de su pista. Para rellenar el suyo, una
    // pista abre SU módulo: este fichero no se vuelve a tocar.
    //
    // Todos quedan dentro de lo que ya funciona: la deduplicación por
    // `event.id` de HU-ST-05 los envuelve igual que a los de arriba (el
    // `claimStripeEvent` del POST es anterior a este `switch`), y la
    // verificación de las dos firmas de HU-ST-01 no cambia.
    //
    // El patrón es el de `invoice.paid`: un `{ ok: false }` sube y la ruta
    // responde 500 para que Stripe reintente con backoff, en vez de dar el
    // evento por consumido. Es lo que salva el caso real de esta familia de
    // eventos — Stripe no garantiza el orden, y un `charge.refunded` puede
    // adelantar al `invoice.paid` que crea el `Payment` que hay que actualizar.
    // ----------------------------------------------------------------------

    // HU-ST-20 · Reembolsos y notas de crédito → P2
    case "charge.refunded": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileChargeRefunded(orgId, event.data.object as Stripe.Charge);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }
    case "credit_note.created":
    case "credit_note.updated":
    case "credit_note.voided": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileCreditNote(orgId, event.data.object as Stripe.CreditNote, event.type);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    // HU-ST-21 · Disputas y contracargos → P2
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileDispute(orgId, event.data.object as Stripe.Dispute, event.type);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    // HU-ST-23 · Payouts y desglose del cobro → P4
    case "payout.paid":
    case "payout.failed": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcilePayout(orgId, event.data.object as Stripe.Payout, event.type);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    // HU-ST-12 · Mandato SEPA y primer cobro asíncrono → P1
    case "mandate.updated": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileMandateUpdated(orgId, event.data.object as Stripe.Mandate);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await reconcileAsyncPayment(
        orgId,
        event.data.object as Stripe.Checkout.Session,
        event.type
      );
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    // HU-ST-16 · Preaviso de cobro (SEPA: 14 días naturales) → P1
    case "invoice.upcoming": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      const result = await sendSepaPrenotification(orgId, event.data.object as Stripe.Invoice);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    // HU-ST-22 · Tarjetas por caducar → P1
    case "customer.source.expiring":
    case "payment_method.automatically_updated": {
      const orgId = await resolveConnectOrgId(event.account);
      if (!orgId) break;
      // Se pasa el evento entero: los dos casos traen objetos de tipos
      // distintos (Card/Source frente a PaymentMethod).
      const result = await reconcileCardExpiry(orgId, event);
      if (!result.ok) return { ok: false, error: result.error };
      break;
    }

    default:
      break;
  }
  return { ok: true };
}

/** F5: `event.account` (acct_...) → `orgId` local, o `null` si no reconocemos la cuenta. */
async function resolveConnectOrgId(accountId: string | null | undefined): Promise<string | null> {
  if (!accountId) return null;
  const account = await prisma.stripeAccount.findUnique({ where: { accountId }, select: { orgId: true } });
  return account?.orgId ?? null;
}

type PlatformEventResult = { ok: true } | { ok: false; error: string };

/** Parte A.4: eventos de la suscripción de plataforma (Apta cobra al director). RB-PLAT-004: idempotente. */
async function handlePlatformEvent(event: Stripe.Event): Promise<PlatformEventResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.orgId;

      // La ausencia de `orgId` es lo que distingue un ALTA (la organización aún
      // no existe: nace aquí) de una RENOVACIÓN o cambio de plan.
      if (!orgId) {
        const result = await provisionOrganizationFromCheckout(session);
        if (!result.ok) {
          console.error("[webhook] alta no completada:", result.error);
          return { ok: false, error: result.error };
        }
        break;
      }

      await applyPlanChangeFromCheckout(orgId, session);
      break;
    }
    case "invoice.paid": {
      // HU-ST-02: `Invoice.subscription` ya no existe en la API vigente. La
      // resolución de los dos shapes vive en `lib/stripe-invoice.ts`, compartida
      // con el plano 2.
      await reconcilePlatformInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    }
    case "invoice.payment_failed": {
      await reconcilePlatformInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const org = await prisma.organization.findUnique({ where: { platformStripeSubscriptionId: subscription.id } });
      if (!org) break;

      // Impago persistente vs baja voluntaria: Stripe marca `cancellation_details.reason`
      // como "cancellation_requested" en la baja voluntaria; cualquier otro motivo
      // (o dunning agotado) se trata como impago persistente (D-6: SUSPENDED, no se purga).
      const voluntary = subscription.cancellation_details?.reason === "cancellation_requested";
      await prisma.organization.update({
        where: { id: org.id },
        data: { platformStatus: voluntary ? "CANCELLED" : "SUSPENDED" },
      });
      break;
    }
    default:
      break;
  }
  return { ok: true };
}

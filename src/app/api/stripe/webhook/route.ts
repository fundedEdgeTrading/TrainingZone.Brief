import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { reconcileConnectCheckoutCompleted, reconcileStripePaymentFailed } from "@/lib/stripe-checkout";
import {
  reconcileMemberSubscriptionUpserted,
  reconcileMemberSubscriptionDeleted,
  reconcileMemberInvoicePaid,
  reconcileMemberInvoicePaymentFailed,
} from "@/lib/member-billing";
import { prisma } from "@/lib/prisma";
import { refreshStripeAccountStatus } from "@/lib/stripe-connect";
import { applyPlanChangeFromCheckout, provisionOrganizationFromCheckout } from "@/lib/provisioning";

/**
 * F12/RB-PAGO-002 + Parte A.4/C.4. Un único endpoint para los dos planos de
 * cobro (§0): los eventos de cuentas CONECTADAS (Parte C, gimnasio → socios)
 * llegan con `event.account` presente; los de PLATAFORMA (Apta → gimnasio,
 * Parte A) llegan sin él. Se rutan por separado para no mezclarlos.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ ok: false, error: "Stripe no está configurado en este entorno." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ ok: false, error: "Falta la firma de Stripe." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, error: "Firma inválida." }, { status: 400 });
  }

  if (event.account) {
    const result = await handleConnectEvent(event);
    if (!result.ok) {
      // 500 a propósito, igual que en `handlePlatformEvent`: Stripe reintenta
      // con backoff. El caso real es el `invoice.paid` de una suscripción
      // recién creada llegando antes que el `customer.subscription.created`
      // que la crea localmente (Stripe no garantiza el orden) — antes esto se
      // tragaba con 200 y el evento se daba por consumido para siempre.
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
  } else {
    const result = await handlePlatformEvent(event);
    if (!result.ok) {
      // 500 a propósito: Stripe reintenta con backoff. Devolver 200 aquí daba
      // el evento por consumido, así que un alta que no llegara a completarse
      // dejaba a un cliente que YA ha pagado sin organización y sin que nadie
      // lo volviera a intentar.
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
  }

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
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof (invoice as { subscription?: string | Stripe.Subscription | null }).subscription === "string"
          ? (invoice as { subscription?: string }).subscription
          : (invoice as { subscription?: Stripe.Subscription | null }).subscription?.id ?? null;
      if (!subscriptionId) break;

      const org = await prisma.organization.findUnique({ where: { platformStripeSubscriptionId: subscriptionId } });
      if (!org) break;

      const periodEnd = invoice.lines?.data?.[0]?.period?.end;
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          platformStatus: "ACTIVE",
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        },
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof (invoice as { subscription?: string | Stripe.Subscription | null }).subscription === "string"
          ? (invoice as { subscription?: string }).subscription
          : (invoice as { subscription?: Stripe.Subscription | null }).subscription?.id ?? null;
      if (!subscriptionId) break;

      const org = await prisma.organization.findUnique({ where: { platformStripeSubscriptionId: subscriptionId } });
      if (!org) break;

      await prisma.organization.update({ where: { id: org.id }, data: { platformStatus: "PAST_DUE" } });
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

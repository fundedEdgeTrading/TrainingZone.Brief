import { prisma } from "@/lib/prisma";
import { getStripeClient, isPlatformStripeConfigured } from "@/lib/stripe";
import {
  fundadorMaxSeats,
  getPlatformPlan,
  listPurchasablePlans,
  resolveStripePriceId,
} from "@/lib/platform-plans";

export type PlatformCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

function appBaseUrl() {
  return (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Checkout de la licencia SIN organización previa (alta pago-primero). No lleva
 * `orgId` en los metadatos: es justo eso lo que distingue un alta nueva de una
 * renovación cuando llega el webhook. La organización se crea al confirmarse el
 * pago (RB-ALTA-001).
 *
 * Los datos fiscales los recoge Stripe (`tax_id_collection`): Apta no factura
 * (D-12), solo necesita que Stripe pueda emitir su recibo.
 */
export async function createLicenseCheckoutSession(planCode: string): Promise<PlatformCheckoutResult> {
  if (!isPlatformStripeConfigured()) {
    return { ok: false, error: "El pago online no está disponible todavía. Escríbenos y te damos de alta." };
  }

  const plan = listPurchasablePlans().find((p) => p.code === planCode);
  if (!plan) return { ok: false, error: "Ese plan no está disponible." };

  const priceId = resolveStripePriceId(plan);
  if (!priceId) return { ok: false, error: "Ese plan no tiene precio configurado." };

  // Cupo de la oferta limitada: se comprueba antes de cobrar, no después.
  if (plan.limitedOffer) {
    const maxSeats = fundadorMaxSeats();
    const sold = await prisma.organization.count({ where: { platformPlan: plan.code } });
    if (maxSeats > 0 && sold >= maxSeats) {
      return { ok: false, error: "La oferta Fundador ha agotado sus plazas." };
    }
  }

  const stripe = getStripeClient()!;
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: plan.interval === "lifetime" ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_creation: plan.interval === "lifetime" ? "always" : undefined,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: `${appBaseUrl()}/activar?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appBaseUrl()}/planes?checkout=cancelado`,
    metadata: { planCode: plan.code },
  });

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };
  return { ok: true, url: checkoutSession.url };
}

/** A.4: cobro de plataforma para una organización YA existente (renovación o cambio de plan). */
export async function createPlatformCheckoutSession(orgId: string, planCode: string): Promise<PlatformCheckoutResult> {
  if (!isPlatformStripeConfigured()) {
    return { ok: false, error: "Stripe no está configurado en este entorno (falta STRIPE_SECRET_KEY)." };
  }
  const plan = getPlatformPlan(planCode);
  if (!plan) return { ok: false, error: "Plan no reconocido." };
  const priceId = resolveStripePriceId(plan);
  if (!priceId) return { ok: false, error: "Este plan aún no tiene precio configurado en Stripe." };

  const stripe = getStripeClient()!;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, billingEmail: true, platformStripeCustomerId: true },
  });
  if (!org) return { ok: false, error: "Organización no encontrada." };

  let customerId = org.platformStripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: org.billingEmail ?? undefined,
      metadata: { orgId: org.id },
    });
    customerId = customer.id;
    await prisma.organization.update({ where: { id: org.id }, data: { platformStripeCustomerId: customerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: plan.interval === "lifetime" ? "payment" : "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appBaseUrl()}/activar?checkout=success`,
    cancel_url: `${appBaseUrl()}/activar?checkout=cancelled`,
    metadata: { orgId: org.id, planCode: plan.code },
  });

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };
  return { ok: true, url: checkoutSession.url };
}


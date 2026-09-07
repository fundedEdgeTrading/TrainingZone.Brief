import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { resolveInvoicePeriodEnd, resolveInvoiceSubscriptionId } from "@/lib/stripe-invoice";
import { platformCheckoutKey, platformCustomerKey } from "@/lib/stripe-idempotency";
import { getStripeClient, isPlatformStripeConfigured } from "@/lib/stripe";
import {
  fundadorEnabled,
  fundadorMaxSeats,
  getPlatformPlan,
  isDemoModeActive,
  resolveStripePriceId,
} from "@/lib/platform-plans";
import { publicOrigin } from "@/lib/site";

export type PlatformCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

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
  const plan = getPlatformPlan(planCode);
  if (!plan) return { ok: false, error: "Ese plan no está disponible." };
  if (plan.limitedOffer && !fundadorEnabled()) return { ok: false, error: "Ese plan no está disponible." };

  // Sin Stripe configurado no hay pago real posible: se enseña una pantalla de
  // demo en vez de fingir un checkout que no puede completarse.
  if (isDemoModeActive()) {
    return { ok: true, url: `${publicOrigin()}/demo-checkout?plan=${encodeURIComponent(plan.code)}` };
  }

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

  // HU-ST-04: única creación deliberadamente SIN clave de idempotencia. El
  // comprador es anónimo (no hay org ni socio todavía), así que la única clave
  // posible sería plan + ventana temporal, y con ella dos personas comprando el
  // mismo plan a la vez recibirían la MISMA sesión de checkout. El motivo
  // completo está en `lib/stripe-idempotency.ts`.
  const stripe = getStripeClient()!;
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: plan.interval === "lifetime" ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_creation: plan.interval === "lifetime" ? "always" : undefined,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    success_url: `${publicOrigin()}/activar?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicOrigin()}/planes?checkout=cancelado`,
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
    const customer = await stripe.customers.create(
      {
        name: org.name,
        email: org.billingEmail ?? undefined,
        metadata: { orgId: org.id },
      },
      { idempotencyKey: platformCustomerKey(org.id) }
    );
    customerId = customer.id;
    await prisma.organization.update({ where: { id: org.id }, data: { platformStripeCustomerId: customerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: plan.interval === "lifetime" ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${publicOrigin()}/activar?checkout=success`,
      cancel_url: `${publicOrigin()}/activar?checkout=cancelled`,
      metadata: { orgId: org.id, planCode: plan.code },
    },
    { idempotencyKey: platformCheckoutKey(org.id, plan.code) }
  );

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };
  return { ok: true, url: checkoutSession.url };
}


// ---------- Webhook de PLATAFORMA: conciliación de la licencia (HU-ST-02) ----------
// Lo llama exclusivamente `handlePlatformEvent` del webhook. Vivía en línea
// dentro de la ruta y leía `invoice.subscription`, un campo que la API vigente
// ya no entrega: el plano 1 llevaba desde la actualización del SDK sin renovar
// ni marcar impagos. Aquí abajo se puede probar sin levantar el endpoint.

/**
 * `invoice.paid` de plataforma: la organización queda ACTIVE y su
 * `currentPeriodEnd` se mueve al fin de periodo de la factura.
 *
 * Idempotente por construcción: escribe un estado final, no un incremento, así
 * que una reentrega del mismo evento deja exactamente lo mismo.
 */
export async function reconcilePlatformInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const org = await prisma.organization.findUnique({
    where: { platformStripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  if (!org) return;

  const periodEnd = resolveInvoicePeriodEnd(invoice);
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      platformStatus: "ACTIVE",
      platformStatusSince: new Date(),
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    },
  });
}

/** `invoice.payment_failed` de plataforma: la licencia pasa a PAST_DUE. */
export async function reconcilePlatformInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const org = await prisma.organization.findUnique({
    where: { platformStripeSubscriptionId: subscriptionId },
    select: { id: true, platformStatus: true },
  });
  if (!org) return;
  if (org.platformStatus === "PAST_DUE") return; // reentrega: ya está marcada

  await prisma.organization.update({
    where: { id: org.id },
    data: { platformStatus: "PAST_DUE", platformStatusSince: new Date() },
  });
}

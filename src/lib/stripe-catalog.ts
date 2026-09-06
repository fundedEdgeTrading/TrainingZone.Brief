import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { isRecurring } from "@/lib/plan-recurrence";
import { priceKey, productKey } from "@/lib/stripe-idempotency";

/**
 * HU-ST-08 / RB-VENTA-007 · Sincronización real del catálogo con Stripe.
 *
 * El espejo era perezoso y **de ida sola**: `ensureStripePrice` creaba producto
 * y precio la primera vez que alguien compraba, y a partir de ahí nada volvía a
 * Stripe. Consecuencias reales:
 *
 *  · Cambiar el precio invalidaba `stripePriceId` en local, pero **el Price
 *    viejo se quedaba activo en Stripe** para siempre.
 *  · `name`, `description` e `imageUrl` —lo que el socio ve en el checkout—
 *    **nunca se propagaban**: el gimnasio renombraba "Bono 10" a "Bono 10
 *    sesiones" y en la pasarela seguía el nombre viejo.
 *  · Archivar un producto lo ocultaba en Apta y lo dejaba `active:true` en
 *    Stripe.
 *
 * **RB-VENTA-007: nunca borrar un `Price`; archivar.** Un precio borrado se
 * lleva por delante las `Subscription` vivas que cuelgan de él.
 *
 * Todo lo de aquí es **best-effort**: un fallo de Stripe no puede impedir
 * guardar un producto. Lo que se devuelve es el estado de la sincronización, y
 * un plan sin `stripePriceId` es exactamente lo que la UI lee como "pendiente
 * de sincronizar".
 */

export const PLAN_PRICE_CHANGED_ACTION = "MEMBERSHIP_PLAN_PRICE_CHANGED";

export type PlanStripeSync =
  /** Sincronizado: producto y precio al día en la cuenta conectada. */
  | { state: "synced"; productId: string; priceId: string }
  /** No hay a dónde sincronizar (sin Stripe conectado, o el onboarding sin terminar). */
  | { state: "pending"; reason: string }
  /** Stripe respondió con un error: el producto está guardado, el espejo no. */
  | { state: "failed"; error: string };

/** Lo que el plan era ANTES de guardarlo, para saber qué hay que propagar. */
export type PlanSnapshotBeforeSave = {
  priceCents: number;
  stripeProductId: string | null;
  stripePriceId: string | null;
  stripeAccountId: string | null;
};

/**
 * ¿Un plan está pendiente de sincronizar con Stripe? Es lo que pinta la UI del
 * catálogo. Sin `stripePriceId` no se puede vender online: `ensureStripePrice`
 * lo creará en el próximo intento, si para entonces hay cuenta conectada.
 */
export function isPendingStripeSync(plan: { stripePriceId: string | null }): boolean {
  return !plan.stripePriceId;
}

/**
 * Propaga a Stripe lo que acaba de cambiar en un plan.
 *
 * `before` es el estado previo al guardado: sin él no se puede archivar el
 * Price anterior, porque quien invalida `stripePriceId` en local
 * (`saveMembershipPlan`) ya ha perdido su id cuando llega aquí.
 */
export async function syncPlanToStripe(
  orgId: string,
  planId: string,
  before: PlanSnapshotBeforeSave | null,
  actorUserId?: string | null
): Promise<PlanStripeSync> {
  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { state: "pending", reason: resolved.error };
  const { stripe, accountId } = resolved;

  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId } });
  if (!plan) return { state: "failed", error: "Producto no encontrado." };

  try {
    const productId = await ensureProduct(stripe, accountId, plan);
    const priceId = await ensurePrice(stripe, accountId, plan, productId, before);

    await prisma.membershipPlan.update({
      where: { id: plan.id },
      data: { stripeProductId: productId, stripePriceId: priceId, stripeAccountId: accountId },
    });

    // La traza del cambio de importe se escribe DESPUÉS de que Stripe lo haya
    // aceptado: un AuditLog que dice "subimos a 59 €" cuando la pasarela sigue
    // cobrando 49 € es peor que no tenerlo.
    if (before && before.priceCents !== plan.priceCents) {
      await prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: actorUserId ?? null,
          action: PLAN_PRICE_CHANGED_ACTION,
          entityType: "MembershipPlan",
          entityId: plan.id,
          metadata: {
            previousPriceCents: before.priceCents,
            priceCents: plan.priceCents,
            previousStripePriceId: before.stripePriceId,
            stripePriceId: priceId,
          },
        },
      });
    }

    return { state: "synced", productId, priceId };
  } catch (error) {
    // Stripe caído o rechazando: el producto ya está guardado en Apta y se queda
    // pendiente de sincronizar. Un checkout posterior lo reintentará por
    // `ensureStripePrice`.
    console.error("[stripe-catalog] no se pudo sincronizar el plan con Stripe", { orgId, planId, error });
    return { state: "failed", error: "No se pudo sincronizar el producto con Stripe." };
  }
}

/**
 * Producto de Stripe al día. Si el gimnasio reconectó otra cuenta, el producto
 * de la anterior no vale ahí: se crea uno nuevo.
 *
 * `name`, `description` e `imageUrl` se actualizan sobre el producto existente
 * —**no** generan precio nuevo—: es literalmente lo que ve el socio en el
 * checkout.
 */
async function ensureProduct(
  stripe: Stripe,
  accountId: string,
  plan: { id: string; orgId: string; name: string; description: string | null; imageUrl: string | null; active: boolean; stripeProductId: string | null; stripeAccountId: string | null }
): Promise<string> {
  const payload = {
    name: plan.name,
    // Stripe rechaza la cadena vacía; `null` es la forma de borrar el campo.
    description: plan.description?.trim() || null,
    // Solo URLs: Stripe no admite `data:` en `images`, y el resto de la app las
    // usa para la demo. Enviar una data URL devolvería 400 y tumbaría el resto
    // de la sincronización por un detalle cosmético.
    images: plan.imageUrl && /^https?:\/\//i.test(plan.imageUrl) ? [plan.imageUrl] : [],
    // Ocultar en Apta oculta también en Stripe. Quien lo tiene contratado sigue
    // igual: archivar un producto no cancela ninguna suscripción.
    active: plan.active,
  };

  if (plan.stripeProductId && plan.stripeAccountId === accountId) {
    // En `update`, `description: null` es lo que BORRA la descripción; en
    // `create` el tipo no lo admite (no hay nada que borrar), así que se omite.
    await stripe.products.update(plan.stripeProductId, payload, { stripeAccount: accountId });
    return plan.stripeProductId;
  }

  const created = await stripe.products.create(
    { ...payload, description: payload.description ?? undefined },
    { stripeAccount: accountId, idempotencyKey: productKey(plan.orgId, plan.id) }
  );
  return created.id;
}

/**
 * Precio de Stripe al día.
 *
 * Los precios de Stripe son **inmutables**: cambiar el importe obliga a crear
 * uno nuevo. El anterior se **archiva** (`active:false`), nunca se borra
 * (RB-VENTA-007) — las `Subscription` vivas siguen colgando de él y cobrando el
 * importe anterior hasta que se las migre explícitamente (HU-ST-13).
 */
async function ensurePrice(
  stripe: Stripe,
  accountId: string,
  plan: { id: string; orgId: string; type: Parameters<typeof isRecurring>[0]; priceCents: number; stripePriceId: string | null; stripeAccountId: string | null },
  productId: string,
  before: PlanSnapshotBeforeSave | null
): Promise<string> {
  const recurring = isRecurring(plan.type);

  // Espejo válido y sin cambio de importe: nada que hacer.
  if (plan.stripePriceId && plan.stripeAccountId === accountId) {
    return plan.stripePriceId;
  }

  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "eur",
      unit_amount: plan.priceCents,
      ...(recurring ? { recurring: { interval: "month" as const } } : {}),
    },
    { stripeAccount: accountId, idempotencyKey: priceKey(plan.orgId, plan.id, plan.priceCents, recurring) }
  );

  // Archivar el anterior, si lo había y no es el mismo (idempotencia: repetir la
  // creación devuelve el mismo Price, y archivarlo dejaría el plan sin precio
  // vendible).
  const previousPriceId = before?.stripePriceId ?? null;
  if (previousPriceId && previousPriceId !== price.id && before?.stripeAccountId === accountId) {
    // Un fallo aquí no puede tumbar la sincronización: el precio NUEVO ya
    // existe y es el que se va a cobrar. El viejo archivado a mano es una
    // molestia; un plan sin precio es una venta perdida.
    try {
      await stripe.prices.update(previousPriceId, { active: false }, { stripeAccount: accountId });
    } catch (error) {
      console.error("[stripe-catalog] no se pudo archivar el precio anterior", { previousPriceId, error });
    }
  }

  return price.id;
}

/**
 * Estado del plan ANTES de guardarlo. Lo llama `saveMembershipPlan` para poder
 * pasárselo luego a `syncPlanToStripe`.
 */
export async function readPlanSnapshot(orgId: string, planId: string): Promise<PlanSnapshotBeforeSave | null> {
  const plan = await prisma.membershipPlan.findFirst({
    where: { id: planId, orgId },
    select: { priceCents: true, stripeProductId: true, stripePriceId: true, stripeAccountId: true },
  });
  return plan ?? null;
}

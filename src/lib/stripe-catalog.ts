import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { isRecurring } from "@/lib/plan-recurrence";
import { idempotencyKey, productKey } from "@/lib/stripe-idempotency";
import { PLAN_ARCHIVED_ERROR } from "@/lib/member-billing";

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

/**
 * Lo que este módulo usa del cliente de Stripe. Acotado para poder probar el
 * catálogo sin red (un `Stripe` real encaja tal cual).
 */
export type CatalogStripe = {
  products: Pick<Stripe["products"], "create" | "update">;
  prices: Pick<Stripe["prices"], "create" | "update" | "list">;
};

/** `stripeForOrg` por defecto; los tests inyectan una pasarela de mentira. */
export type CatalogStripeResolver = (
  orgId: string
) => Promise<{ ok: true; stripe: CatalogStripe; accountId: string } | { ok: false; error: string }>;

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
  actorUserId?: string | null,
  resolve: CatalogStripeResolver = stripeForOrg
): Promise<PlanStripeSync> {
  const resolved = await resolve(orgId);
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
 * CON-04 · **La única puerta** para obtener el Price activo de un plan en la
 * cuenta conectada de su organización. Checkout de recepción, portal del socio,
 * landing y renovaciones deben pasar por aquí (P2 migra `ensureStripePrice`).
 *
 * - Plan acotado por `orgId`: un `planId` de otra organización es "no encontrado".
 * - Plan archivado: no se vende (mismo mensaje que el resto de puertas).
 * - Espejo al día en esta cuenta: se devuelve sin llamar a Stripe (RB-VENTA-002,
 *   el espejo es perezoso: nada de `prices.retrieve` por venta).
 * - Si falta o la cuenta conectada cambió: producto al día, Price nuevo con
 *   clave versionada (CON-03) y **archivado** del anterior, nunca borrado.
 */
export async function ensurePlanPriceForAccount(
  orgId: string,
  planId: string,
  resolve: CatalogStripeResolver = stripeForOrg
): Promise<{ ok: true; priceId: string; productId: string; accountId: string } | { ok: false; error: string }> {
  // El plan antes que la pasarela: que esté archivado no depende de Stripe.
  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId } });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (!plan.active) return { ok: false, error: PLAN_ARCHIVED_ERROR };

  const resolved = await resolve(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  if (plan.stripePriceId && plan.stripeProductId && plan.stripeAccountId === accountId) {
    return { ok: true, priceId: plan.stripePriceId, productId: plan.stripeProductId, accountId };
  }

  try {
    const productId = await ensureProduct(stripe, accountId, plan);
    const priceId = await ensurePrice(stripe, accountId, plan, productId, {
      priceCents: plan.priceCents,
      stripeProductId: plan.stripeProductId,
      stripePriceId: plan.stripePriceId,
      stripeAccountId: plan.stripeAccountId,
    });
    await prisma.membershipPlan.update({
      where: { id: plan.id },
      data: { stripeProductId: productId, stripePriceId: priceId, stripeAccountId: accountId },
    });
    return { ok: true, priceId, productId, accountId };
  } catch (error) {
    console.error("[stripe-catalog] no se pudo asegurar el precio del plan", { orgId, planId, error });
    return { ok: false, error: "No se pudo preparar el precio del producto en Stripe." };
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
  stripe: CatalogStripe,
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
 * CON-03 · `price:<orgId>:<planId>_<importe>_<rec|one>_<Price anterior>:v2`.
 *
 * La clave de antes solo llevaba plan e importe. Stripe guarda cada clave 24 h
 * y devuelve la MISMA respuesta: si el importe iba A → B → A en un día, la
 * vuelta a A recuperaba el Price A del primer paso, que para entonces ya
 * estaba ARCHIVADO, y todo checkout del plan fallaba. Con el Price al que se
 * sustituye dentro de la clave, la vuelta a A es otra creación (su anterior es
 * B, no "ninguno"), y el doble clic sigue colisionando: los dos clics leen el
 * mismo anterior. `v2` la separa de las claves `v1` que aún usa
 * `ensureStripePrice` hasta que migre a `ensurePlanPriceForAccount`.
 */
export function catalogPriceKey(
  orgId: string,
  planId: string,
  unitAmountCents: number,
  recurring: boolean,
  previousPriceId: string | null
) {
  return idempotencyKey(
    "price",
    orgId,
    [planId, String(unitAmountCents), recurring ? "rec" : "one", previousPriceId ?? "none"],
    "v2"
  );
}

/** ¿Este Price de Stripe cobra exactamente lo que dice el plan? */
function priceMatches(price: Stripe.Price, unitAmountCents: number, recurring: boolean): boolean {
  if (!price.active || price.currency !== "eur" || price.unit_amount !== unitAmountCents) return false;
  // Solo un precio plano por unidad: uno escalonado o con `transform_quantity`
  // puede tener el mismo `unit_amount` y cobrar otra cosa.
  if (price.billing_scheme !== "per_unit" || price.transform_quantity) return false;
  if (!recurring) return !price.recurring;
  return (
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1 &&
    price.recurring.usage_type === "licensed"
  );
}

/**
 * Precio de Stripe al día.
 *
 * Los precios de Stripe son **inmutables**: cambiar el importe obliga a crear
 * uno nuevo. El anterior se **archiva** (`active:false`), nunca se borra
 * (RB-VENTA-007) — las `Subscription` vivas siguen colgando de él y cobrando el
 * importe anterior hasta que se las migre explícitamente (HU-ST-13).
 *
 * Antes de crear nada se mira qué Prices activos tiene el producto: si alguno
 * ya cobra el importe del plan se reutiliza (un reintento tras un fallo al
 * guardar en local no crea otro), y todos los demás se archivan, de modo que el
 * producto queda con UN solo Price vendible aunque el `before` se haya perdido
 * (plan invalidado en local con Stripe caído).
 */
async function ensurePrice(
  stripe: CatalogStripe,
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

  const opts = { stripeAccount: accountId };
  const activePrices = (await stripe.prices.list({ product: productId, active: true, limit: 100 }, opts)).data;

  // El Price al que se sustituye: el que el plan tenía en ESTA cuenta, o si se
  // perdió, el que siga activo en el producto (orden estable para que dos
  // procesos calculen la misma clave).
  const knownPrevious = before?.stripeAccountId === accountId ? before.stripePriceId : null;
  const previousPriceId =
    knownPrevious ?? activePrices.map((p) => p.id).sort()[0] ?? null;

  const reusable = activePrices.find((p) => priceMatches(p, plan.priceCents, recurring));
  const priceId = reusable
    ? reusable.id
    : (
        await stripe.prices.create(
          {
            product: productId,
            currency: "eur",
            unit_amount: plan.priceCents,
            ...(recurring ? { recurring: { interval: "month" as const } } : {}),
          },
          { ...opts, idempotencyKey: catalogPriceKey(plan.orgId, plan.id, plan.priceCents, recurring, previousPriceId) }
        )
      ).id;

  // Archivar el anterior y cualquier otro activo del producto, salvo el que se
  // va a cobrar (idempotencia: repetir la creación devuelve el mismo Price, y
  // archivarlo dejaría el plan sin precio vendible).
  const toArchive = new Set(activePrices.map((p) => p.id));
  if (knownPrevious) toArchive.add(knownPrevious);
  toArchive.delete(priceId);
  for (const oldPriceId of toArchive) {
    // Un fallo aquí no puede tumbar la sincronización: el precio NUEVO ya
    // existe y es el que se va a cobrar. El viejo archivado a mano es una
    // molestia; un plan sin precio es una venta perdida.
    try {
      await stripe.prices.update(oldPriceId, { active: false }, opts);
    } catch (error) {
      console.error("[stripe-catalog] no se pudo archivar el precio anterior", { previousPriceId: oldPriceId, error });
    }
  }

  return priceId;
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

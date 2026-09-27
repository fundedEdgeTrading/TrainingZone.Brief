import type Stripe from "stripe";
import { unstable_cache } from "next/cache";

import { getStripeClient } from "@/lib/stripe";
import {
  PLATFORM_PLANS,
  fundadorEnabled,
  isDemoModeActive,
  type PlatformPlan,
  type PlatformPlanCode,
} from "@/lib/platform-plans";

/**
 * Catálogo comercial de Apta (Plano 1) sincronizado con Stripe.
 *
 * Reparto de responsabilidades:
 *  · **El código** define los tiers y lo que desbloquea cada uno (`PLATFORM_PLANS`:
 *    features, centros, cupo de IA). Eso gobierna el gateo y no puede venir de
 *    Stripe: un producto que el código no conoce no sabría qué dar.
 *  · **Stripe** decide qué se vende y a qué importe. Cada plan se localiza por
 *    su `lookup_key` (`apta_<código>`, p. ej. `apta_avanzado_mes`), que es la
 *    misma en test y en live — ya no hay `price_…` que copiar a variables de
 *    entorno (sustituye a los `STRIPE_PRICE_*` de RB-PLAN-001).
 *
 * Consecuencias en la landing (/planes) y en /activar:
 *  · Precio activo con su lookup key → el plan se ofrece, con el importe real.
 *  · Precio o producto archivado en Stripe → el plan deja de ofrecerse.
 *  · Precio nuevo para un tier existente → se crea en Stripe con la MISMA lookup
 *    key ("transferir lookup key"); las suscripciones antiguas no se tocan.
 *  · En Stripe los precios no se borran: se archivan (invariante del trimestre).
 */

/** Lookup key de Stripe para un plan de plataforma. Estable entre test y live. */
export function platformLookupKey(code: PlatformPlanCode): string {
  return `apta_${code}`;
}

/** Tag de caché: lo invalida el webhook ante `product.*` / `price.*` de la cuenta de Apta. */
export const PLATFORM_PRICE_CATALOG_TAG = "platform-price-catalog";

/**
 * Cinco minutos: el techo de lo rancio que puede estar /planes si el webhook no
 * está suscrito a los eventos de producto y precio. Con él, el cambio es casi
 * inmediato.
 */
export const PLATFORM_PRICE_CATALOG_REVALIDATE = 300;

export type PlatformPriceEntry = {
  priceId: string;
  unitAmount: number;
  currency: string;
};

/** Plano JSON (no `Map`): `unstable_cache` serializa lo que devuelve. */
export type PlatformPriceCatalog = Partial<Record<PlatformPlanCode, PlatformPriceEntry>>;

function priceMatchesInterval(price: Stripe.Price, interval: PlatformPlan["interval"]): boolean {
  if (interval === "lifetime") return price.type === "one_time";
  return (
    price.type === "recurring" &&
    price.recurring?.interval === interval &&
    (price.recurring.interval_count ?? 1) === 1
  );
}

function productIsActive(product: Stripe.Price["product"]): boolean {
  // Sin expandir no se puede saber: se da por activo y lo decide el propio precio.
  if (typeof product === "string") return true;
  if ("deleted" in product && product.deleted) return false;
  return (product as Stripe.Product).active;
}

/**
 * Pura: de la lista de precios de Stripe al catálogo por plan. Descarta (con
 * aviso en log) lo que no se puede vender tal cual: precio o producto
 * archivado, importe no fijo, o una periodicidad que no es la del plan — un
 * `apta_avanzado_mes` anual cobraría otra cosa de la que dice la tarjeta.
 */
export function resolvePlatformPriceCatalog(prices: readonly Stripe.Price[]): PlatformPriceCatalog {
  const catalog: PlatformPriceCatalog = {};
  for (const plan of PLATFORM_PLANS) {
    const price = prices.find((p) => p.lookup_key === platformLookupKey(plan.code));
    if (!price) continue;
    if (!price.active || !productIsActive(price.product)) continue;
    if (price.unit_amount == null) {
      console.warn(`[platform-prices] ${price.lookup_key}: el precio no tiene importe fijo; no se ofrece.`);
      continue;
    }
    if (!priceMatchesInterval(price, plan.interval)) {
      console.warn(
        `[platform-prices] ${price.lookup_key}: la periodicidad del precio no es la del plan (${plan.interval}); no se ofrece.`
      );
      continue;
    }
    catalog[plan.code] = { priceId: price.id, unitAmount: price.unit_amount, currency: price.currency };
  }
  return catalog;
}

async function fetchPlatformPriceCatalog(): Promise<PlatformPriceCatalog> {
  const stripe = getStripeClient();
  if (!stripe) return {};
  const { data } = await stripe.prices.list({
    lookup_keys: PLATFORM_PLANS.map((plan) => platformLookupKey(plan.code)),
    active: true,
    expand: ["data.product"],
    limit: 100,
  });
  return resolvePlatformPriceCatalog(data);
}

const getCachedPlatformPriceCatalog = unstable_cache(fetchPlatformPriceCatalog, ["platform-price-catalog"], {
  revalidate: PLATFORM_PRICE_CATALOG_REVALIDATE,
  tags: [PLATFORM_PRICE_CATALOG_TAG],
});

/**
 * Catálogo vigente. `fresh` salta la caché: el checkout lo pide así para no
 * mandar a Stripe un precio que se acaba de archivar.
 *
 * Si Stripe falla, catálogo vacío (la landing enseña su aviso) en vez de
 * tumbar la página. El error no se cachea: `unstable_cache` no guarda
 * excepciones, así que el siguiente visitante vuelve a intentarlo.
 */
export async function getPlatformPriceCatalog({ fresh = false } = {}): Promise<PlatformPriceCatalog> {
  try {
    return fresh ? await fetchPlatformPriceCatalog() : await getCachedPlatformPriceCatalog();
  } catch (error) {
    console.error("[platform-prices] no se pudo leer el catálogo de Stripe:", error);
    return {};
  }
}

const INTERVAL_SUFFIX: Record<PlatformPlan["interval"], string> = {
  month: "/mes",
  year: "/año",
  lifetime: " pago único",
};

/** "99 €/mes", "1.290 €/año", "3.990 € pago único" — el importe que se cobra. */
export function formatPlatformPrice(entry: Pick<PlatformPriceEntry, "unitAmount" | "currency">, interval: PlatformPlan["interval"]): string {
  const amount = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: entry.currency.toUpperCase(),
    useGrouping: "always",
    minimumFractionDigits: entry.unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(entry.unitAmount / 100);
  return `${amount}${INTERVAL_SUFFIX[interval]}`;
}

/** Un plan que se puede comprar aquí y ahora, con el precio que se enseña. */
export type PurchasablePlan = PlatformPlan & {
  /** El precio de Stripe que se cobra. `null` solo en modo demo: no hay cobro real. */
  stripePrice: PlatformPriceEntry | null;
  displayPrice: string;
};

/**
 * Planes comprables en este entorno: los que tienen precio activo en Stripe,
 * más el interruptor de la oferta limitada. Sin precios no se muestran botones
 * muertos. En modo demo se enseña el catálogo entero con su precio de
 * referencia, porque el pago tampoco es real (ver `isDemoModeActive`).
 */
export async function listPurchasablePlans(): Promise<PurchasablePlan[]> {
  const offered = PLATFORM_PLANS.filter((plan) => !plan.limitedOffer || fundadorEnabled());
  if (isDemoModeActive()) {
    return offered.map((plan) => ({ ...plan, stripePrice: null, displayPrice: plan.priceLabel }));
  }
  const catalog = await getPlatformPriceCatalog();
  return offered.flatMap((plan) => {
    const entry = catalog[plan.code];
    if (!entry) return [];
    return [{ ...plan, stripePrice: entry, displayPrice: formatPlatformPrice(entry, plan.interval) }];
  });
}

/**
 * El `price_…` con el que cobrar un plan, leído de Stripe SIN caché. `null` =
 * plan no vendible ahora (sin precio, o archivado). Es la lista blanca del
 * checkout: el precio nunca llega del navegador, solo el código del plan.
 */
export async function resolvePlatformPriceId(plan: PlatformPlan): Promise<string | null> {
  const catalog = await getPlatformPriceCatalog({ fresh: true });
  return catalog[plan.code]?.priceId ?? null;
}

/** Meses que dura un ciclo de facturación de Stripe (semanas y días, aproximados). */
const MONTHS_PER_INTERVAL: Record<Stripe.Price.Recurring.Interval, number> = {
  day: 12 / 365,
  week: 12 / 52,
  month: 1,
  year: 12,
};

/**
 * Pura: lo que una suscripción de Stripe factura al mes, en céntimos. Suma
 * sus líneas (importe × cantidad) mensualizadas; los descuentos no se
 * restan (MRR bruto, el de lista de cada cliente).
 */
export function subscriptionMonthlyCents(subscription: Stripe.Subscription): number {
  let monthly = 0;
  for (const item of subscription.items.data) {
    const recurring = item.price.recurring;
    if (!recurring || item.price.unit_amount == null) continue;
    const months = MONTHS_PER_INTERVAL[recurring.interval] * (recurring.interval_count || 1);
    monthly += (item.price.unit_amount * (item.quantity ?? 1)) / months;
  }
  return Math.round(monthly);
}

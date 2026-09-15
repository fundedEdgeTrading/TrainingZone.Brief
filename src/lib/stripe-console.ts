import type Stripe from "stripe";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { featureForRoute } from "@/lib/rbac";
import type { PlatformFeature } from "@/lib/platform-plans";
import { stripeReadClient } from "@/lib/billing-shared";

/**
 * HU-ST-24 · Consola de LECTURA de Stripe para dirección (`/stripe`).
 *
 * Capa de datos de la sección. Cuatro reglas la gobiernan, una por escenario de
 * la historia:
 *
 *  1. **Acceso.** Solo `OWNER`, y CADA apertura deja una fila en `AuditLog`
 *     (`STRIPE_CONSOLE_VIEWED`, decisión D-API-3 de la guía). Se registra la
 *     apertura aunque Stripe no conteste: lo que se audita es quién miró, no si
 *     había datos que enseñar.
 *  2. **Entorno.** El distintivo TEST/LIVE sale del prefijo de la clave, que ya
 *     resuelve `stripeReadClient()` en `livemode`. Aquí no se vuelve a mirar la
 *     variable de entorno: una segunda manera de decidirlo es una manera de
 *     decirlo distinto.
 *  3. **Listados.** Paginación POR CURSOR (`starting_after` + `has_more`), que
 *     es la de la API de Stripe. No hay `page=3` que valga: sin cursor no hay
 *     forma de saltar a la página tres sin barrer las dos anteriores.
 *  4. **Error de Stripe.** Cada tarjeta se lee sola y degrada sola. Cuatro
 *     listados contra una API externa son cuatro formas de tumbar la pantalla,
 *     así que ninguna excepción sube: se convierte en una tarjeta en estado
 *     `error` con el mensaje de Stripe, y las otras tres siguen en pie.
 *
 * SOLO LECTURA: todo lo que hay aquí es `list`. Si algún día esta sección emite
 * un refund o crea un cupón, deja de ser esta historia y el cliente deja de ser
 * `stripeReadClient()` (ver `stripeForOrg()`).
 */

// ---------------------------------------------------------------------------
// Escenario 1 · Acceso: rol, gateo por plan y auditoría
// ---------------------------------------------------------------------------

/** La ruta de la consola. Vive aquí para que el gate y el guard hablen de lo mismo. */
export const STRIPE_CONSOLE_ROUTE = "/stripe";

/** "Solo para OWNER": dirección de organización y nadie más. */
export const STRIPE_CONSOLE_ROLES: Role[] = ["OWNER"];

/**
 * Gateo por plan de la sección (invariante de `AGENTS.md`: una ruta nueva sin
 * gate declarado tiene que fallar en test, no en producción).
 *
 * La consola es observabilidad del dinero: la misma familia que el panel de
 * control completo, así que se gatea con `bi_avanzado`.
 *
 * **Por qué el mapa está aquí y no en `FEATURE_BY_ROUTE` (`rbac.ts`)**, que es
 * donde vive el resto: `rbac.ts` está congelado este trimestre y hay nueve
 * pistas trabajando en paralelo. La declaración es la misma —clave de ruta →
 * funcionalidad, con herencia por prefijo— y `featureForStripeConsoleRoute()`
 * consulta PRIMERO el mapa de `rbac.ts`: el día que se levante la congelación,
 * mover esta línea allí no cambia ningún comportamiento ni rompe ningún test.
 */
export const STRIPE_CONSOLE_FEATURE: PlatformFeature = "bi_avanzado";

export const STRIPE_CONSOLE_FEATURE_BY_ROUTE: Record<string, PlatformFeature> = {
  [STRIPE_CONSOLE_ROUTE]: STRIPE_CONSOLE_FEATURE,
};

/**
 * Funcionalidad que cubre una ruta de la consola, CON HERENCIA a las hijas
 * (misma regla que `featureForRoute` en `rbac.ts`: gana la coincidencia de
 * prefijo más larga, y se hereda por segmento, no por texto).
 *
 * Declarar `/stripe` cubre `/stripe/payouts` y `/stripe/payouts/[id]`, así que
 * una sub-vista nueva nace gateada en vez de abrir un agujero.
 */
export function featureForStripeConsoleRoute(pathname: string): PlatformFeature | undefined {
  const declaredInRbac = featureForRoute(pathname);
  if (declaredInRbac) return declaredInRbac;

  let best: { key: string; feature: PlatformFeature } | undefined;
  for (const [key, feature] of Object.entries(STRIPE_CONSOLE_FEATURE_BY_ROUTE)) {
    if (pathname !== key && !pathname.startsWith(`${key}/`)) continue;
    if (!best || key.length > best.key.length) best = { key, feature };
  }
  return best?.feature;
}

/** Acción del registro de auditoría. Append-only, como todo `AuditLog` (ADR-008). */
export const STRIPE_CONSOLE_AUDIT_ACTION = "STRIPE_CONSOLE_VIEWED";

/**
 * La puerta de la sección, en un solo sitio: rol + plan.
 *
 * Que sea una sola función es lo que hace que el test de exhaustividad pueda
 * comprobar que TODA pantalla de `/stripe` pasa por aquí. Se llama desde la
 * página (server component) y no desde el layout a propósito: un layout de Next
 * no se vuelve a ejecutar al navegar entre hermanas, y entonces "cada apertura"
 * dejaría de ser cada apertura en el registro de auditoría.
 */
export async function requireStripeConsole() {
  const session = await requireRole(STRIPE_CONSOLE_ROLES);
  await requireFeature(STRIPE_CONSOLE_FEATURE);
  return session;
}

/** Deja constancia de la apertura. Una fila por apertura, se vea lo que se vea. */
export async function logStripeConsoleOpened(params: {
  orgId: string;
  actorUserId: string | null;
  connected: boolean;
  environment: StripeEnvironment | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: params.orgId,
      actorUserId: params.actorUserId,
      action: STRIPE_CONSOLE_AUDIT_ACTION,
      entityType: "Organization",
      entityId: params.orgId,
      metadata: { connected: params.connected, environment: params.environment },
    },
  });
}

// ---------------------------------------------------------------------------
// Escenario 2 · Entorno: TEST o LIVE
// ---------------------------------------------------------------------------

export type StripeEnvironment = "TEST" | "LIVE";

/**
 * El distintivo. `livemode` lo resuelve `stripeReadClient()` mirando el prefijo
 * de la clave (`sk_live_`/`rk_live_`), que es el único sitio del sistema donde
 * se decide (HU-ST-24 lo comparte con HU-ST-26).
 */
export function stripeEnvironment(livemode: boolean): StripeEnvironment {
  return livemode ? "LIVE" : "TEST";
}

// ---------------------------------------------------------------------------
// Escenario 3 · Listados con paginación por cursor
// ---------------------------------------------------------------------------

export const STRIPE_CONSOLE_LIST_IDS = ["charges", "subscriptions", "customers", "payouts"] as const;

export type StripeConsoleListId = (typeof STRIPE_CONSOLE_LIST_IDS)[number];

/** Rótulo de cada listado. Fuente única: la pantalla no se inventa los suyos. */
export const STRIPE_CONSOLE_LIST_LABEL: Record<StripeConsoleListId, string> = {
  charges: "Cobros",
  subscriptions: "Suscripciones",
  customers: "Clientes",
  payouts: "Transferencias al banco",
};

/**
 * Cuántas filas trae cada tarjeta. Acotado a propósito (guía §C.5): una consola
 * que barre listas sin límite se come el rate limit de la cuenta del gimnasio.
 */
export const STRIPE_CONSOLE_PAGE_SIZE = 10;

/** Fila ya normalizada: la pantalla pinta, no interpreta objetos de Stripe. */
export type StripeConsoleRow = {
  id: string;
  title: string;
  subtitle: string | null;
  amountCents: number | null;
  currency: string | null;
  status: string | null;
  at: Date | null;
};

/** Cursores activos, uno por listado: cada tarjeta avanza por su cuenta. */
export type StripeConsoleCursors = Partial<Record<StripeConsoleListId, string>>;

export type StripeConsoleCard =
  | {
      id: StripeConsoleListId;
      label: string;
      status: "ok";
      rows: StripeConsoleRow[];
      /** Cursor de la página siguiente, o `null` si esta es la última. */
      nextCursor: string | null;
    }
  | {
      id: StripeConsoleListId;
      label: string;
      status: "error";
      /** El mensaje de Stripe, tal cual: es el que dice qué hay que arreglar. */
      message: string;
    };

export type StripeConsoleListPage = { rows: StripeConsoleRow[]; hasMore: boolean };

/**
 * De dónde salen las filas. Se declara como puerto —y no se llama al SDK desde
 * `loadStripeConsoleCards`— para que la degradación del escenario 4 se pueda
 * probar sin red: un origen que lanza en un listado y contesta en los otros
 * tres es exactamente el caso que la historia pide sostener.
 */
export type StripeConsoleSource = {
  livemode: boolean;
  list(listId: StripeConsoleListId, params: { limit: number; startingAfter?: string }): Promise<StripeConsoleListPage>;
};

export type ResolvedStripeConsoleSource =
  | { ok: true; source: StripeConsoleSource }
  /** `reason` es el motivo de `stripeReadClient()`: sin clave, o sin cuenta conectada. */
  | { ok: false; reason: string };

/**
 * Cursor de la página siguiente en la paginación de Stripe: el id del último
 * objeto devuelto, y solo si hay más. `null` significa "no hay siguiente", que
 * es lo que apaga el enlace en la tarjeta.
 */
export function nextCursorFor(page: StripeConsoleListPage): string | null {
  if (!page.hasMore) return null;
  return page.rows.at(-1)?.id ?? null;
}

/**
 * Mensaje con el que degrada una tarjeta. Los errores del SDK de Stripe traen
 * `message` redactado para enseñarse (ni clave ni cuerpo de la petición); lo que
 * no lo traiga cae en una frase que al menos dice qué listado falló.
 */
export function stripeConsoleErrorMessage(listId: StripeConsoleListId, error: unknown): string {
  const message = typeof error === "object" && error !== null ? (error as { message?: unknown }).message : undefined;
  if (typeof message === "string" && message.trim()) return message.trim();
  return `Stripe no pudo devolver ${STRIPE_CONSOLE_LIST_LABEL[listId].toLowerCase()}.`;
}

/**
 * Las cuatro tarjetas, cada una con su cursor y su suerte.
 *
 * Las lecturas van en paralelo pero NINGUNA puede rechazar: cada una se envuelve
 * antes de entrar en el `Promise.all`, así que un fallo de Stripe en cobros no
 * arrastra a suscripciones, clientes ni payouts (escenario 4).
 */
export async function loadStripeConsoleCards(
  source: StripeConsoleSource,
  cursors: StripeConsoleCursors = {}
): Promise<StripeConsoleCard[]> {
  return Promise.all(
    STRIPE_CONSOLE_LIST_IDS.map(async (id): Promise<StripeConsoleCard> => {
      const label = STRIPE_CONSOLE_LIST_LABEL[id];
      try {
        const page = await source.list(id, { limit: STRIPE_CONSOLE_PAGE_SIZE, startingAfter: cursors[id] });
        return { id, label, status: "ok", rows: page.rows, nextCursor: nextCursorFor(page) };
      } catch (error) {
        return { id, label, status: "error", message: stripeConsoleErrorMessage(id, error) };
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Objetos de Stripe → filas
// ---------------------------------------------------------------------------

/** Segundos epoch de Stripe → `Date`. `null` cuando el objeto no trae la fecha. */
function instant(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

/** Nombre de quien pagó: lo que el gimnasio reconoce al mirar la lista. */
function chargePayer(charge: Stripe.Charge): string {
  return charge.billing_details?.name || charge.billing_details?.email || charge.description || charge.id;
}

export function chargeToRow(charge: Stripe.Charge): StripeConsoleRow {
  return {
    id: charge.id,
    title: chargePayer(charge),
    // Un cargo devuelto sigue estando "succeeded" en Stripe: sin esto la lista
    // enseñaría en verde dinero que ya volvió al socio.
    subtitle: charge.refunded ? "Devuelto" : (charge.description ?? null),
    amountCents: charge.amount,
    currency: charge.currency,
    status: charge.status,
    at: instant(charge.created),
  };
}

export function subscriptionToRow(subscription: Stripe.Subscription): StripeConsoleRow {
  const customer = subscription.customer;
  const item = subscription.items?.data?.[0];
  // El periodo vive en el ITEM desde la API 2025-03-31 (la fijada aquí es
  // 2026-07-29.dahlia): `Subscription.current_period_end` ya no existe, y
  // leerlo del sitio viejo devolvía `undefined` en silencio — la misma familia
  // de fallo que BUG-1.
  const renewal = instant(item?.current_period_end);
  return {
    id: subscription.id,
    title: typeof customer === "string" ? customer : (customer?.id ?? subscription.id),
    subtitle: renewal ? "Renueva" : null,
    amountCents: item?.price?.unit_amount ?? null,
    currency: item?.price?.currency ?? subscription.currency ?? null,
    status: subscription.status,
    at: renewal,
  };
}

export function customerToRow(customer: Stripe.Customer): StripeConsoleRow {
  return {
    id: customer.id,
    title: customer.name || customer.email || customer.id,
    subtitle: customer.name && customer.email ? customer.email : null,
    amountCents: null,
    currency: null,
    status: null,
    at: instant(customer.created),
  };
}

export function payoutToRow(payout: Stripe.Payout): StripeConsoleRow {
  return {
    id: payout.id,
    title: payout.failure_message ?? "Transferencia al banco",
    // `arrival_date` es el dato que dirección viene a buscar: cuándo entra.
    subtitle: "Llega",
    amountCents: payout.amount,
    currency: payout.currency,
    status: payout.status,
    at: instant(payout.arrival_date),
  };
}

// ---------------------------------------------------------------------------
// Origen real: la cuenta conectada del gimnasio, en solo lectura
// ---------------------------------------------------------------------------

/**
 * Cliente de la consola. No construye ningún cliente propio: usa el de solo
 * lectura que dejó S1 (`stripeReadClient`), que además resuelve `livemode` para
 * el distintivo del escenario 2.
 *
 * No exige `chargesEnabled`: durante el onboarding de Connect —o después de una
 * revocación— es justo cuando dirección necesita mirar lo que ya se cobró.
 */
export async function resolveStripeConsoleSource(orgId: string): Promise<ResolvedStripeConsoleSource> {
  const client = await stripeReadClient(orgId);
  if (!client.ok) return { ok: false, reason: client.error };

  const { stripe, accountId, livemode } = client;
  // Cabecera `Stripe-Account`: se lee la cuenta del gimnasio, nunca la de Apta.
  const onAccount = { stripeAccount: accountId };

  return {
    ok: true,
    source: {
      livemode,
      async list(listId, { limit, startingAfter }) {
        const params = { limit, ...(startingAfter ? { starting_after: startingAfter } : {}) };
        switch (listId) {
          case "charges": {
            const page = await stripe.charges.list(params, onAccount);
            return { rows: page.data.map(chargeToRow), hasMore: page.has_more };
          }
          case "subscriptions": {
            const page = await stripe.subscriptions.list({ ...params, status: "all" }, onAccount);
            return { rows: page.data.map(subscriptionToRow), hasMore: page.has_more };
          }
          case "customers": {
            const page = await stripe.customers.list(params, onAccount);
            return { rows: page.data.map(customerToRow), hasMore: page.has_more };
          }
          case "payouts": {
            const page = await stripe.payouts.list(params, onAccount);
            return { rows: page.data.map(payoutToRow), hasMore: page.has_more };
          }
        }
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Enlaces de paginación
// ---------------------------------------------------------------------------

/**
 * Enlace de "siguiente" de UNA tarjeta, conservando el cursor de las otras
 * tres: avanzar en cobros no puede devolver payouts a su primera página.
 *
 * `cursor === null` quita el parámetro (volver al principio de esa tarjeta).
 */
export function stripeConsoleHref(
  cursors: StripeConsoleCursors,
  listId: StripeConsoleListId,
  cursor: string | null
): string {
  const params = new URLSearchParams();
  for (const id of STRIPE_CONSOLE_LIST_IDS) {
    const value = id === listId ? cursor : cursors[id];
    if (value) params.set(id, value);
  }
  const query = params.toString();
  return query ? `${STRIPE_CONSOLE_ROUTE}?${query}` : STRIPE_CONSOLE_ROUTE;
}

/** Lee los cursores de la query, quedándose solo con los cuatro conocidos. */
export function parseStripeConsoleCursors(params: Record<string, string | string[] | undefined>): StripeConsoleCursors {
  const cursors: StripeConsoleCursors = {};
  for (const id of STRIPE_CONSOLE_LIST_IDS) {
    const raw = params[id];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim()) cursors[id] = value.trim();
  }
  return cursors;
}

import type Stripe from "stripe";
import { publicOrigin } from "@/lib/site";
import { getStripeClient, stripeForOrg } from "@/lib/stripe";
import { idempotencyKey } from "@/lib/stripe-idempotency";

/**
 * CON-02 · Configuración del Billing Portal de la cuenta CONECTADA del gimnasio,
 * creada por API para que nadie tenga que entrar al Dashboard de Stripe.
 *
 * Sin configuración, `billingPortal.sessions.create` falla en una cuenta recién
 * conectada, y el botón "Gestionar mi suscripción" del socio no lleva a ningún
 * sitio. Lo que el socio puede hacer ahí, y nada más:
 *
 *  · actualizar su método de pago,
 *  · ver y descargar sus facturas,
 *  · darse de baja A FIN DE PERIODO (lo ya pagado se disfruta; no hay
 *    prorrateos ni devoluciones automáticas),
 *
 * y NO puede cambiar de plan ni de cantidad: eso cambia sesiones de bono y
 * precio, y pasa por recepción o por el checkout de Apta, que son los que
 * escriben `SessionLedger` y conocen el catálogo.
 *
 * **Si el gimnasio ya tiene una configuración por defecto, no se pisa.** Es
 * suya: puede haberla hecho a mano y saber lo que quiere. La nuestra se crea
 * solo cuando falta, y se marca con `metadata.apta` para reconocerla después
 * sin crear otra.
 */

/** Marca de la configuración que crea Apta. Súbela si cambian las `features`. */
export const APTA_PORTAL_CONFIG_TAG = "member-portal-v1";

/** Lo que hace falta del cliente de Stripe: acotado para poder probarlo sin red. */
export type PortalConfigStripe = {
  billingPortal: {
    configurations: Pick<Stripe["billingPortal"]["configurations"], "list" | "create">;
  };
};

export function memberPortalConfigurationParams(): Stripe.BillingPortal.ConfigurationCreateParams {
  return {
    name: "Apta · portal del socio",
    default_return_url: `${publicOrigin()}/portal/membresia`,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: { enabled: false },
      customer_update: { enabled: false },
    },
    metadata: { apta: APTA_PORTAL_CONFIG_TAG },
  };
}

/** `portal_config:<orgId>:<acct>:<marca>` — una sola creación por cuenta conectada. */
export function portalConfigKey(orgId: string, accountId: string) {
  return idempotencyKey("portal_config", orgId, [accountId, APTA_PORTAL_CONFIG_TAG]);
}

export type PortalConfigResult =
  /** El gimnasio ya tenía una por defecto: se respeta y la usan las sesiones sin más. */
  | { state: "default-exists"; configurationId: string }
  /** Ya existía la de Apta (reconexión, reintento): no se crea otra. */
  | { state: "existing"; configurationId: string }
  | { state: "created"; configurationId: string };

/**
 * Idempotente: se puede llamar al completar la conexión y otra vez cada vez que
 * haga falta ("si falta, créala"). Nunca modifica una configuración existente.
 */
export async function ensureMemberPortalConfiguration(
  stripe: PortalConfigStripe,
  orgId: string,
  accountId: string
): Promise<PortalConfigResult> {
  const opts = { stripeAccount: accountId };

  const defaults = await stripe.billingPortal.configurations.list({ is_default: true, active: true, limit: 1 }, opts);
  const current = defaults.data[0];
  if (current) return { state: "default-exists", configurationId: current.id };

  const active = await stripe.billingPortal.configurations.list({ active: true, limit: 100 }, opts);
  const ours = active.data.find((c) => c.metadata?.apta === APTA_PORTAL_CONFIG_TAG);
  if (ours) return { state: "existing", configurationId: ours.id };

  // La clave cubre la carrera de dos llamadas simultáneas (callback + primer
  // intento de portal): las dos reciben la misma configuración.
  const created = await stripe.billingPortal.configurations.create(memberPortalConfigurationParams(), {
    ...opts,
    idempotencyKey: portalConfigKey(orgId, accountId),
  });
  return { state: "created", configurationId: created.id };
}

/**
 * Versión para quien solo tiene el `orgId` (el callback de Connect, o
 * `member-billing` antes de abrir una sesión del portal). Best-effort: un fallo
 * de Stripe se devuelve, no se lanza — la conexión de la cuenta ya está hecha y
 * no puede deshacerse por esto.
 *
 * `configurationId` es el que hay que pasar como `configuration` a
 * `billingPortal.sessions.create` cuando `state` no es `default-exists`: una
 * configuración creada por API no pasa a ser la por defecto de la cuenta.
 */
export async function ensureMemberPortalConfigurationForOrg(
  orgId: string
): Promise<{ ok: true; result: PortalConfigResult } | { ok: false; error: string }> {
  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  try {
    return { ok: true, result: await ensureMemberPortalConfiguration(resolved.stripe, orgId, resolved.accountId) };
  } catch (error) {
    console.error("[stripe-portal-config] no se pudo asegurar la configuración del portal", { orgId, error });
    return { ok: false, error: "No se pudo preparar el portal de cliente de Stripe." };
  }
}

/**
 * Al completar la conexión (callback de OAuth). No pasa por `stripeForOrg`
 * porque una cuenta recién conectada suele tener aún el onboarding a medias
 * (`chargesEnabled: false`), y la configuración del portal no depende de eso:
 * se deja hecha ya para que el primer socio no se encuentre el botón roto.
 */
export async function ensureMemberPortalConfigurationForAccount(
  orgId: string,
  accountId: string
): Promise<{ ok: true; result: PortalConfigResult } | { ok: false; error: string }> {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "Stripe no está configurado en este entorno." };
  try {
    return { ok: true, result: await ensureMemberPortalConfiguration(stripe, orgId, accountId) };
  } catch (error) {
    console.error("[stripe-portal-config] no se pudo asegurar la configuración del portal", { orgId, accountId, error });
    return { ok: false, error: "No se pudo preparar el portal de cliente de Stripe." };
  }
}

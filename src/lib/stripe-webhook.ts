import type Stripe from "stripe";

/**
 * HU-ST-01 / RB-PAGO-020 · Un endpoint de Stripe puede escuchar eventos de la
 * cuenta de la plataforma **o** de las cuentas conectadas, y cada uno de los dos
 * flujos se firma con su PROPIO signing secret. El código verificaba con un
 * único secreto, así que uno de los dos flujos devolvía siempre 400 "Firma
 * inválida": `.env.example` ya anticipaba `STRIPE_CONNECT_WEBHOOK_SECRET` y el
 * código no lo leía nunca.
 *
 * Aquí se resuelve con qué secreto valida la firma y, de paso, a qué manejador
 * va el evento. El módulo es puro (no toca base de datos ni red) para poder
 * probar la verificación real de firma con `Stripe.webhooks.generateTestHeaderString`.
 */

/** Los dos planos de cobro: plataforma (Apta → gimnasio) y Connect (gimnasio → socios). */
export type StripeWebhookSource = "platform" | "connect";

export type StripeWebhookSecrets = {
  /** `STRIPE_WEBHOOK_SECRET`: endpoint de la cuenta de Apta. */
  platform?: string | null;
  /** `STRIPE_CONNECT_WEBHOOK_SECRET`: endpoint de "cuentas conectadas". */
  connect?: string | null;
};

export type VerifiedStripeWebhook =
  | { ok: true; event: Stripe.Event; source: StripeWebhookSource }
  | { ok: false; error: string };

/** Lee los dos secretos del entorno. Ninguno es obligatorio por separado; al menos uno sí. */
export function readWebhookSecrets(
  env: Record<string, string | undefined> = process.env
): StripeWebhookSecrets {
  return {
    platform: env.STRIPE_WEBHOOK_SECRET || null,
    connect: env.STRIPE_CONNECT_WEBHOOK_SECRET || null,
  };
}

export function hasAnyWebhookSecret(secrets: StripeWebhookSecrets): boolean {
  return !!secrets.platform || !!secrets.connect;
}

/**
 * `event.account` es la marca canónica de Stripe: los eventos de una cuenta
 * conectada la llevan, los de la plataforma no. Es el criterio de reserva
 * cuando el secreto no desempata (un solo secreto configurado, o los dos
 * iguales porque el mismo endpoint atiende ambos flujos).
 */
function sourceFromEvent(event: Stripe.Event): StripeWebhookSource {
  return event.account ? "connect" : "platform";
}

/**
 * Verifica la firma contra los secretos configurados y devuelve el evento junto
 * con el plano al que pertenece.
 *
 * El orden importa poco (una firma solo valida con su secreto), pero el
 * desempate sí: si los dos secretos están configurados y son distintos, **el
 * secreto que ha validado manda** sobre `event.account` — es exactamente lo que
 * distingue un endpoint del otro en el Dashboard. Con un único secreto
 * configurado se mantiene el comportamiento anterior (enrutado por
 * `event.account`), que es lo que hace compatible hacia atrás el despliegue
 * actual sin `STRIPE_CONNECT_WEBHOOK_SECRET`.
 */
export function verifyStripeWebhook(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  secrets: StripeWebhookSecrets
): VerifiedStripeWebhook {
  if (!hasAnyWebhookSecret(secrets)) {
    return { ok: false, error: "Stripe no está configurado en este entorno." };
  }

  const distinct = !!secrets.platform && !!secrets.connect && secrets.platform !== secrets.connect;

  const candidates: Array<{ secret: string; source: StripeWebhookSource }> = [];
  if (secrets.platform) candidates.push({ secret: secrets.platform, source: "platform" });
  if (secrets.connect && secrets.connect !== secrets.platform) {
    candidates.push({ secret: secrets.connect, source: "connect" });
  }

  for (const candidate of candidates) {
    try {
      const event = stripe.webhooks.constructEvent(rawBody, signature, candidate.secret);
      return { ok: true, event, source: distinct ? candidate.source : sourceFromEvent(event) };
    } catch {
      // Sigue con el otro secreto: una firma que no valida con este puede ser
      // legítima del otro flujo.
    }
  }

  return { ok: false, error: "Firma inválida." };
}

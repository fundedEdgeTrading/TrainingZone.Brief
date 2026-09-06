/**
 * HU-ST-07 · Estado de la cuenta conectada del gimnasio, a la vista.
 *
 * Hasta ahora la UI solo sabía dos cosas (`chargesEnabled`, `payoutsEnabled`), y
 * el caso intermedio —conectado pero con el KYC a medias— se veía igual que "no
 * conectado": el director pulsaba "Conectar" otra vez, Stripe le devolvía a la
 * misma pantalla y nadie le decía qué papel le faltaba.
 *
 * Este módulo es PURO: traduce lo que devuelve `accounts.retrieve` a algo que se
 * puede pintar. La parte que habla con Stripe vive en `stripe-connect.ts`.
 *
 * **Decisión D-S1: cuentas Standard.** El gimnasio es dueño de su cuenta de
 * Stripe: completa su verificación y activa sus métodos de pago desde SU
 * Dashboard, no desde Apta. Por eso todo lo que aquí falta se resuelve con un
 * enlace, no con un formulario nuestro.
 */

/** Dashboard del propio gimnasio: es su cuenta, entra con sus credenciales. */
export const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";
export const STRIPE_PAYMENT_METHODS_URL = "https://dashboard.stripe.com/settings/payment_methods";

export type ConnectRequirement = {
  /** Código tal cual lo entrega Stripe, para poder buscarlo en su documentación. */
  code: string;
  /** Qué le falta al gimnasio, en castellano y sin jerga. */
  label: string;
};

export type ConnectStatus =
  /** El entorno no tiene Connect configurado: no hay OAuth posible. */
  | { state: "not-configured"; missing: string[] }
  /** Nadie ha conectado todavía. */
  | { state: "not-connected" }
  /** Conectada, pero Stripe aún no deja cobrar: falta verificación. */
  | {
      state: "pending";
      accountId: string;
      currentlyDue: ConnectRequirement[];
      disabledReason: string | null;
      dashboardUrl: string;
    }
  /** Conectada y operativa. */
  | {
      state: "ready";
      accountId: string;
      payoutsEnabled: boolean;
      nextPayoutAt: Date | null;
      nextPayoutCents: number | null;
      dashboardUrl: string;
    }
  /** Conectada, pero Stripe no ha respondido: se degrada sin tumbar la pantalla. */
  | { state: "unavailable"; accountId: string; error: string };

/**
 * Traducción de los requisitos de verificación de Stripe.
 *
 * La lista cubre lo que Stripe pide de verdad a un gimnasio español (empresa o
 * autónomo). Lo que no esté aquí cae al genérico: es preferible una etiqueta
 * imperfecta con el código al lado a un `individual.verification.document`
 * crudo, que no significa nada para quien lo lee.
 *
 * Los prefijos `company.` / `individual.` se normalizan: Stripe usa uno u otro
 * según el tipo de cuenta y el requisito es el mismo papel.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  "business_profile.mcc": "La categoría de tu negocio",
  "business_profile.url": "La web de tu gimnasio (o una descripción del negocio)",
  "business_profile.product_description": "Una descripción de lo que vendes",
  "business_type": "Si cobras como empresa o como autónomo",
  "external_account": "La cuenta bancaria donde quieres recibir el dinero",
  "tos_acceptance.date": "Aceptar las condiciones de servicio de Stripe",
  "tos_acceptance.ip": "Aceptar las condiciones de servicio de Stripe",
  "address.city": "La ciudad de tu dirección fiscal",
  "address.line1": "Tu dirección fiscal",
  "address.postal_code": "El código postal de tu dirección fiscal",
  "address.state": "La provincia de tu dirección fiscal",
  "dob.day": "Tu fecha de nacimiento",
  "dob.month": "Tu fecha de nacimiento",
  "dob.year": "Tu fecha de nacimiento",
  "email": "Un email de contacto",
  "first_name": "Tu nombre",
  "last_name": "Tus apellidos",
  "id_number": "Tu NIF o NIE",
  "phone": "Un teléfono de contacto",
  "tax_id": "El CIF de la empresa",
  "name": "La razón social de la empresa",
  "verification.document": "Una foto de tu DNI, NIE o pasaporte",
  "verification.additional_document": "Un documento adicional que Stripe te pide (justificante de domicilio)",
  "owners": "Los datos de los socios de la empresa",
  "directors": "Los datos de los administradores de la empresa",
  "executives": "Los datos de los apoderados de la empresa",
  "representative": "Los datos de quien representa a la empresa",
};

/** `company.address.city`, `individual.address.city` y `address.city` son el mismo papel. */
function normalizeRequirementCode(code: string): string {
  return code
    .replace(/^(company|individual|representative)\./, "")
    .replace(/^(owners|directors|executives)\[\d+\]\./, "")
    .replace(/^relationship\./, "");
}

export function translateRequirement(code: string): ConnectRequirement {
  const normalized = normalizeRequirementCode(code);
  const label =
    REQUIREMENT_LABELS[normalized] ??
    REQUIREMENT_LABELS[code] ??
    `Un dato que Stripe todavía necesita (${code})`;
  return { code, label };
}

/**
 * Traduce y **deduplica**: `dob.day`, `dob.month` y `dob.year` son tres códigos
 * y una sola cosa que pedirle al director. Ver tres veces "Tu fecha de
 * nacimiento" en una lista de pendientes hace pensar que hay tres problemas.
 */
export function translateRequirements(codes: readonly string[]): ConnectRequirement[] {
  const seen = new Set<string>();
  const out: ConnectRequirement[] = [];
  for (const code of codes) {
    const requirement = translateRequirement(code);
    if (seen.has(requirement.label)) continue;
    seen.add(requirement.label);
    out.push(requirement);
  }
  return out;
}

/** Motivos por los que Stripe bloquea los cobros, en castellano. */
const DISABLED_REASONS: Record<string, string> = {
  "requirements.past_due": "Stripe ha bloqueado los cobros: hay documentación vencida.",
  "requirements.pending_verification": "Stripe está revisando tu documentación. Suele tardar unas horas.",
  "listed": "Stripe ha bloqueado la cuenta tras una revisión. Tienes que contactar con su soporte.",
  "platform_paused": "La conexión con Apta está en pausa.",
  "rejected.fraud": "Stripe ha rechazado la cuenta. Tienes que contactar con su soporte.",
  "rejected.listed": "Stripe ha rechazado la cuenta. Tienes que contactar con su soporte.",
  "rejected.other": "Stripe ha rechazado la cuenta. Tienes que contactar con su soporte.",
  "under_review": "Stripe está revisando la cuenta.",
  "other": "Stripe todavía no permite cobrar con esta cuenta.",
};

export function translateDisabledReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return DISABLED_REASONS[reason] ?? "Stripe todavía no permite cobrar con esta cuenta.";
}

/** Lo mínimo que hace falta de `accounts.retrieve` para decidir el estado. */
export type ConnectAccountSnapshot = {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: readonly string[];
  disabledReason: string | null;
  /** Próximo payout: `arrival_date` en epoch de segundos e importe en céntimos. */
  nextPayoutArrival: number | null;
  nextPayoutCents: number | null;
};

export function buildConnectStatus(snapshot: ConnectAccountSnapshot): ConnectStatus {
  if (!snapshot.chargesEnabled) {
    return {
      state: "pending",
      accountId: snapshot.accountId,
      currentlyDue: translateRequirements(snapshot.currentlyDue),
      disabledReason: translateDisabledReason(snapshot.disabledReason),
      dashboardUrl: STRIPE_DASHBOARD_URL,
    };
  }

  return {
    state: "ready",
    accountId: snapshot.accountId,
    payoutsEnabled: snapshot.payoutsEnabled,
    nextPayoutAt: snapshot.nextPayoutArrival ? new Date(snapshot.nextPayoutArrival * 1000) : null,
    nextPayoutCents: snapshot.nextPayoutCents,
    dashboardUrl: STRIPE_DASHBOARD_URL,
  };
}

/** Qué variables de entorno faltan para que el botón de conectar sirva de algo. */
export function missingConnectEnvVars(env: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = [];
  if (!env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (!env.STRIPE_CONNECT_CLIENT_ID) missing.push("STRIPE_CONNECT_CLIENT_ID");
  return missing;
}

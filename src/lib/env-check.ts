import { isDemoModeActive } from "@/lib/demo-mode";

/**
 * PROD-02 · Arranque fail-fast en producción.
 *
 * Cada variable de esta lista tenía un "modo degradado" pensado para
 * desarrollo que en producción es un fallo silencioso: sin Stripe se encendía
 * la demo (PROD-01), sin Brevo el correo se simulaba (PROD-03), sin
 * `JOBS_CRON_SECRET` las reglas temporales no corren nunca, sin
 * `PROGRESS_PHOTO_DIR` las fotos van a un disco efímero que se pierde en cada
 * despliegue, y con el `AUTH_SECRET` del ejemplo cualquiera firma sesiones.
 * Mejor no arrancar que arrancar y callarse, igual que E10-07 con la región.
 *
 * Puro: recibe el entorno y devuelve la lista de problemas. **Nunca incluye
 * valores**, solo nombres y motivos: esta lista acaba en el log de arranque.
 */
export type EnvProblem = { name: string; reason: string };

type Env = Record<string, string | undefined>;

/** Valores publicados en el repositorio: cualquiera que lo lea los tiene. */
const PUBLIC_AUTH_SECRETS = new Set(["change-me-in-production", "ci-secret-no-usar-en-produccion"]);
const PUBLIC_PHOTO_KEYS = new Set([
  "ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZCE=", // .env.example
  "Y2ktb25seS1rZXktbm90LWZvci1wcm9kdWN0aW9uISE=", // .github/workflows/e2e.yml
]);

const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Lo que solo hace falta si se cobra de verdad. En el despliegue de demo en
 * producción (DEMO_MODE + ALLOW_DEMO_IN_PRODUCTION, dos banderas explícitas)
 * el pago se sustituye por /demo-checkout, y poner una clave de Stripe de
 * relleno sería peor que no ponerla: `isPlatformStripeConfigured()` pasaría a
 * true y los caminos de cobro real intentarían hablar con Stripe.
 */
const STRIPE_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_CONNECT_CLIENT_ID",
] as const;

/**
 * Correo y dominio público. En la demo en producción (el CI arranca así, con
 * `next start` contra http://localhost) no se exigen: el mailer ya no finge
 * enviar en producción —devuelve ok:false y lo registra (PROD-03)— y forzar
 * https rompería las URL absolutas que la demo construye hacia localhost.
 */
const DEMO_OPTIONAL_VARS = ["BREVO_API_KEY", "BREVO_FROM_EMAIL"] as const;

const ALWAYS_REQUIRED_VARS = ["PROGRESS_PHOTO_KEY", "PROGRESS_PHOTO_DIR", "JOBS_CRON_SECRET"] as const;

function present(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function checkProductionEnv(env: Env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const demo = isDemoModeActive(env);

  const authSecret = present(env, "AUTH_SECRET");
  if (!authSecret) {
    problems.push({ name: "AUTH_SECRET", reason: "falta" });
  } else if (PUBLIC_AUTH_SECRETS.has(authSecret)) {
    problems.push({ name: "AUTH_SECRET", reason: "es un valor de ejemplo publicado en el repositorio" });
  } else if (authSecret.length < MIN_AUTH_SECRET_LENGTH) {
    problems.push({ name: "AUTH_SECRET", reason: `demasiado corto (mínimo ${MIN_AUTH_SECRET_LENGTH} caracteres)` });
  }

  const required: readonly string[] = [
    ...(demo ? [] : STRIPE_VARS),
    ...(demo ? [] : DEMO_OPTIONAL_VARS),
    ...ALWAYS_REQUIRED_VARS,
  ];
  for (const name of required) {
    if (!present(env, name)) problems.push({ name, reason: "falta" });
  }

  const photoKey = present(env, "PROGRESS_PHOTO_KEY");
  if (photoKey) {
    if (PUBLIC_PHOTO_KEYS.has(photoKey)) {
      problems.push({ name: "PROGRESS_PHOTO_KEY", reason: "es una clave de ejemplo publicada en el repositorio" });
    } else if (Buffer.from(photoKey, "base64").length !== 32) {
      problems.push({ name: "PROGRESS_PHOTO_KEY", reason: "no son 32 bytes en base64 (openssl rand -base64 32)" });
    }
  }

  const siteUrl = present(env, "NEXT_PUBLIC_SITE_URL");
  if (!siteUrl) {
    if (!demo) problems.push({ name: "NEXT_PUBLIC_SITE_URL", reason: "falta" });
  } else if (!demo && !isHttpsUrl(siteUrl)) {
    problems.push({ name: "NEXT_PUBLIC_SITE_URL", reason: "debe ser una URL https://" });
  }

  return problems;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Decide si se comprueba y qué se hace con el resultado. Solo aborta en
 * producción y fuera del `next build`: durante el build los secretos de
 * ejecución no tienen por qué estar (Render los inyecta al arrancar), y un
 * build que fallara por eso no protegería nada.
 */
export function assertProductionEnv(env: Env = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PHASE === "phase-production-build") return;

  if (isDemoModeActive(env)) {
    console.warn(
      "[PROD-02] MODO DEMO ACTIVO EN PRODUCCIÓN (DEMO_MODE + ALLOW_DEMO_IN_PRODUCTION): " +
        "/demo-checkout da de alta sin cobrar. Solo es correcto en un despliegue de demostración o en CI."
    );
  }

  const problems = checkProductionEnv(env);
  if (problems.length === 0) return;
  const detail = problems.map((p) => `${p.name}: ${p.reason}`).join("; ");
  throw new Error(`[PROD-02] Configuración de producción incompleta, el servidor no arranca. ${detail}`);
}

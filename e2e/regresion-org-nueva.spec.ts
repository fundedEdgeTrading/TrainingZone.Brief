import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { completeMemberOnboarding } from "@/app/onboarding/[token]/actions";
import { loginAs } from "./helpers";
import { bearer, mobileLogin } from "./fixtures/mobile-api";
import { assertCleanDatabase, db, disconnectDb } from "./fixtures/org-nueva/db";
import { addDaysISO, dbDay, madridDay, weekdayOf } from "./fixtures/org-nueva/fechas";
import { pendingInvitationToken } from "./fixtures/org-nueva/invitaciones";
import { expectMailLogged, serverLogPath } from "./fixtures/org-nueva/mailer-log";
import {
  bookAsFiller,
  createFillerMember,
  createInvitedMember,
  type FillerMember,
} from "./fixtures/org-nueva/socios-relleno";
import { payHostedCheckout } from "./fixtures/org-nueva/stripe-checkout";
import {
  TINY_PNG,
  chooseInField,
  expectToast,
  fieldByLabel,
  fieldInput,
  fillNewPassword,
  toast,
} from "./fixtures/org-nueva/ui";

/**
 * P12 · Regresión de una organización NUEVA, de la compra del plan a la
 * asistencia: los pasos marcados con 🤖 en el §4 de
 * docs/PASO_A_PRODUCCION_2_CENTROS.md, en orden y como un recorrido serial
 * sobre una base de datos SIN seed. Cada test lleva en el título el ID del
 * guion; el diseño de los casos está en el informe de qa-senior de la pista.
 *
 * ┌──────┬──────────────────────────────────────────────────────────────────────┐
 * │ ID   │ Qué se comprueba                                                    │
 * ├──────┼──────────────────────────────────────────────────────────────────────┤
 * │ O1   │ /planes → Avanzado → pago simulado → organización ACTIVE + OWNER +  │
 * │      │ invitación y email de activación                                    │
 * │ O2   │ Activación del OWNER → /puesta-en-marcha con "Canales de captación" │
 * │      │ ya resuelto (P10)                                                   │
 * │ O3   │ Centros A y B con ficha pública y aforo; el 4.º centro se bloquea;  │
 * │      │ productos "Mensual EP 8" y "Bono 5 EP"                              │
 * │ E1   │ Alta de Entrenador 1 (A), Entrenador 2 (A + imputación a B) y       │
 * │      │ Dirección de B, con invitación y email                              │
 * │ E2   │ Activación de los tres; cada uno ve solo su ámbito en /agenda       │
 * │ L1   │ Lead manual en A con canal "Instagram" (P10)                        │
 * │ L2   │ Formulario público de B; organización suspendida sin leads (P10)    │
 * │ L4   │ Conversión del lead de B en socio con sus datos y bienvenida (P10)  │
 * │ S1   │ Alta de socio en A con foto, teléfono y nacimiento + bienvenida     │
 * │ S2   │ Onboarding del socio con consentimientos y muro de primera sesión;  │
 * │      │ el servidor exige el de salud (P8)                                  │
 * │ V1   │ Una sola valoración INITIAL aunque el cron corra a la vez (P8)      │
 * │ V2   │ El socio rellena su parte de la valoración (profesión/rutina: P8)   │
 * │ V3   │ El entrenador la cierra y se propaga; el consentimiento de imagen   │
 * │      │ se mantiene (P8)                                                    │
 * │ C1   │ Compra de "Mensual EP 8" desde el portal (demo): 8 sesiones,        │
 * │      │ PURCHASE +8, Payment PAID                                           │
 * │ R1   │ Sesiones en A (EP, grupo 4, clase 10) y en B; una sin entrenador    │
 * │      │ también se ve (P6)                                                  │
 * │ R2   │ El socio reserva el grupo: −1 y asiento BOOKING con bookingId (P9)  │
 * │ R3   │ Grupo lleno → lista de espera → cancelación → reclamo del hueco     │
 * │ R6   │ El staff reserva EP: rechazo por aforo, descuento del bono y corte  │
 * │      │ al moroso (P6)                                                      │
 * │ R10  │ El entrenador pasa lista (ATTENDED / NO_SHOW); ni WAITLISTED ni     │
 * │      │ CANCELLED pasan a ATTENDED                                          │
 * │ C4   │ Consumir el bono hasta 0: la siguiente reserva se bloquea           │
 * ├──────┼──────────────────────────────────────────────────────────────────────┤
 * │ C1s  │ @stripe · Compra real con Checkout de test en la cuenta conectada   │
 * │ C5   │ @stripe · Adelantar renovación (P2/P4)                              │
 * │ C8   │ @stripe · Test Clock +1 mes: recarga una sola vez aunque el evento  │
 * │      │ llegue repetido                                                     │
 * └──────┴──────────────────────────────────────────────────────────────────────┘
 *
 * ## Estado en release
 *
 * Con las pistas P1–P12 mezcladas, lo que dependía de P6, P8, P9 y P10 ya
 * pasa y se afirma en duro; cada paso conserva el comentario con la pista que
 * lo cerró. Solo quedan en `expect.soft` las dos de V2: la profesión en la
 * parte del socio de la valoración (P8-7), que P8 dejó para los formularios
 * del socio y no está. Fallan a propósito, pero dejan comprobar el resto del
 * paso. Al ser
 * `serial`, un test en rojo deja sin ejecutar los siguientes.
 *
 * ## Requisitos de entorno (recorrido principal, modo demo)
 *
 * - `E2E_CLEAN_DB=true`. Sin ella los dos bloques se SALTAN: este spec crea
 *   organizaciones, socios y cobros y no puede tocar nunca la base de demo.
 *   Además `beforeAll` comprueba que no hay ninguna organización ni rastro del
 *   seed, y falla si los hay.
 * - `DATABASE_URL` apuntando a una base DESECHABLE, `AUTH_SECRET`,
 *   `NEXTAUTH_URL=http://localhost:3000`, `DATA_REGION=frankfurt` (con
 *   `next start` el arranque exige la región aunque la base esté en localhost)
 *   y `JOBS_CRON_SECRET` (V1 dispara el cron a la vez que el onboarding).
 * - SIN `BREVO_API_KEY`: los emails se comprueban por la línea `[mailer]` que
 *   escribe el servidor (con `next start`, PROD-03, "correo NO enviado": se
 *   comprueba que se intentó, con su asunto y destinatario).
 * - Modo demo EXPLÍCITO (PROD-01): `DEMO_MODE=true` y, con `next start`,
 *   `ALLOW_DEMO_IN_PRODUCTION=true`. Ya no basta con quitar `STRIPE_SECRET_KEY`:
 *   el modo demo gana aunque la clave esté. `beforeAll` falla si el proceso de
 *   Playwright no ve las dos (las carga del mismo `.env` que el servidor por
 *   `dotenv` en `playwright.config.ts`; una variable del shell tiene prioridad).
 * - Con `next start` el arranque valida el entorno (PROD-02) y el servidor no
 *   levanta si falla: `AUTH_SECRET` de 32+ caracteres y que NO sea uno de los
 *   valores de ejemplo publicados en el repositorio, `PROGRESS_PHOTO_KEY` de 32
 *   bytes en base64 (`openssl rand -base64 32`) que tampoco sea la de ejemplo,
 *   `PROGRESS_PHOTO_DIR` (un directorio escribible) y `JOBS_CRON_SECRET`.
 * - `E2E_SERVER_LOG`: ruta del fichero con la salida del servidor.
 *
 * ## Preparar una base limpia y lanzar el recorrido
 *
 * ```bash
 * sudo -u postgres psql -c 'DROP DATABASE IF EXISTS trainingzone_clean WITH (FORCE)' \
 *                       -c 'CREATE DATABASE trainingzone_clean'
 * DATABASE_URL=postgresql://…/trainingzone_clean npx prisma migrate deploy   # SIN db:seed
 * npm run build && npm run start > /tmp/server-org-nueva.log 2>&1 &
 * E2E_CLEAN_DB=true E2E_SERVER_LOG=/tmp/server-org-nueva.log \
 *   npx playwright test e2e/regresion-org-nueva.spec.ts --grep-invert @stripe
 * ```
 *
 * El log va FUERA de `test-results/`: Playwright vacía esa carpeta al empezar
 * cada ejecución y el servidor seguiría escribiendo en un fichero ya borrado.
 * `playwright.config.ts` tiene `reuseExistingServer: true`, así que usa el
 * servidor arrancado a mano. Recrea la base (y reinicia el servidor) antes de
 * cada ejecución: el recorrido exige partir de cero.
 *
 * ## Bloque @stripe (C1 real, C5, C8)
 *
 * Autocontenido: crea su propia organización pagando /planes con el Checkout
 * de test, registra la cuenta conectada de test como `StripeAccount`
 * `chargesEnabled` (O4, conectar por OAuth, es manual) y crea lo mínimo
 * (centro, producto MONTHLY, socio con un Customer con Test Clock).
 *
 * ```bash
 * stripe listen --forward-to localhost:3000/api/stripe/webhook \
 *               --forward-connect-to localhost:3000/api/stripe/webhook
 * # el whsec que imprime vale para los dos secretos
 * DEMO_MODE=false STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \
 * npm run start > /tmp/server-org-nueva-stripe.log 2>&1 &
 * # la cuenta de test necesita un precio mensual con lookup key `apta_avanzado_mes`
 * E2E_CLEAN_DB=true E2E_SERVER_LOG=/tmp/server-org-nueva-stripe.log DEMO_MODE=false \
 * STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \
 * E2E_STRIPE_CONNECTED_ACCOUNT=acct_… \
 *   npx playwright test e2e/regresion-org-nueva.spec.ts --grep @stripe
 * ```
 *
 * La cuenta `acct_…` tiene que estar conectada a la plataforma de esa clave
 * (Connect, modo test) y poder cobrar. El reenvío del `invoice.paid` de C8 se
 * hace por API (se recupera el evento y se vuelve a firmar y entregar con el
 * mismo `id`); a mano equivale a `stripe events resend evt_… --account acct_…`.
 */

test.use({ timezoneId: "Europe/Madrid" });

const TAG = String(Date.now());
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Datos del recorrido principal ───────────────────────────────────────────
const ORG_NAME = `Org Nueva E2E ${TAG}`;
const OWNER_EMAIL = `owner.${TAG}@org-nueva-e2e.es`;
const OWNER_PASSWORD = "OwnerNueva!2026";
const STAFF_PASSWORD = "EquipoNuevo!2026";
const MEMBER_PASSWORD = "SociaNueva!2026";

const CENTER_A = `Centro A ${TAG}`;
const CENTER_B = `Centro B ${TAG}`;
const CENTER_C = `Centro C ${TAG}`;
const CENTER_D = `Centro D ${TAG}`;

const TRAINER1 = { name: `Entrenador Uno ${TAG}`, email: `entrenador1.${TAG}@org-nueva-e2e.es` };
const TRAINER2 = { name: `Entrenador Dos ${TAG}`, email: `entrenador2.${TAG}@org-nueva-e2e.es` };
const DIRECTOR_B = { name: `Directora B ${TAG}`, email: `directora.b.${TAG}@org-nueva-e2e.es` };

// Nombres del guion: la base es nueva, no hace falta hacerlos únicos.
const PLAN_MONTHLY = "Mensual EP 8";
const PLAN_EP = "Bono 5 EP";

const LEAD_MANUAL = { firstName: "Lucía", lastName: `Instagram ${TAG}`, phone: "600111222" };
const LEAD_PUBLIC = {
  firstName: "Pablo",
  lastName: `Público ${TAG}`,
  phone: "600333444",
  email: `lead.publico.${TAG}@org-nueva-e2e.es`,
  birthDate: "1994-06-02",
  goals: "Ganar fuerza y quitarme el dolor de espalda",
};
const LEAD_SUSPENDED_EMAIL = `lead.suspendida.${TAG}@org-nueva-e2e.es`;

const SOCIA = {
  firstName: "Sara",
  lastName: `Socia ${TAG}`,
  email: `socia.${TAG}@org-nueva-e2e.es`,
  phone: "+34600555666",
  birthDate: "1990-03-15",
};
const SOCIA_NAME = `${SOCIA.firstName} ${SOCIA.lastName}`;

// Sesiones: horas centrales y días +2..+5 en Madrid, lejos del límite de 30
// minutos de antelación, de la ventana de 7 días y de la de cancelación de 24 h.
const DAY_GROUP4 = madridDay(2);
const DAY_EP = madridDay(3);
const DAY_CLASS10 = madridDay(4);
const DAY_EP_MOROSO = madridDay(4);
const DAY_EP_FREE = madridDay(5);
const DAY_NO_TRAINER = madridDay(5);
// Pasar lista y consumir el bono se hace sobre días YA pasados: con P6 el
// check-in de una sesión futura se rechaza (R14), y lo que se prueba aquí es
// la asistencia, no esa regla.
const DAY_R10 = madridDay(-1);
const C4_BASE = (() => {
  // Lunes de hace dos semanas: la serie de laborables tiene ya diez días
  // pasados donde reservar y asistir.
  let d = madridDay(-14);
  while (weekdayOf(d) !== 1) d = addDaysISO(d, -1);
  return d;
})();

const T_GROUP4 = `Grupo semanal 4 ${TAG}`;
const T_CLASS10 = `Clase grupo 10 ${TAG}`;
const T_EP = `EP puntual ${TAG}`;
const T_GROUP_B = `Grupo B ${TAG}`;
const T_NO_TRAINER = `Sin entrenador ${TAG}`;
const T_EP_FREE = `EP libre ${TAG}`;
const T_EP_MOROSO = `EP moroso ${TAG}`;
const T_R10 = `Pasar lista ${TAG}`;
const T_C4 = `Serie laborables ${TAG}`;

type SessionSpec = {
  centerId: string;
  type: "personal" | "reduced";
  title: string;
  dateISO: string;
  capacity?: number;
  trainerName: string;
  recurrence?: "Cada semana" | "Todos los días laborables (L–V)";
  memberName?: string;
};

/**
 * Nueva sesión por el diálogo de la agenda, como la crea dirección. No afirma
 * el resultado: quien llama decide si espera "Sesión creada" o un rechazo.
 */
async function submitSessionDialog(page: Page, spec: SessionSpec) {
  await page.goto(`/agenda?center=${spec.centerId}&week=${spec.dateISO}`);
  await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
  const title = page.getByPlaceholder("Añadir título");
  await expect(title).toBeVisible({ timeout: 15_000 });
  // El tipo reescribe el prefijo del título: primero el tipo.
  await page
    .getByRole("button", { name: spec.type === "reduced" ? "Grupo reducido" : "Entrenamiento personal", exact: true })
    .click();
  // Elegir socio reescribe el título con su nombre: primero el socio, luego el título.
  if (spec.memberName) {
    await page.locator('[data-field="member"] button[aria-haspopup="listbox"]').click();
    await page.locator(".tz-select-pop").getByPlaceholder("Buscar...").fill(spec.memberName);
    await page.locator(".tz-select-pop").getByRole("button", { name: spec.memberName, exact: true }).click();
  }
  await title.fill(spec.title);
  await page.locator('input[type="date"]').first().fill(spec.dateISO);
  await page.locator('input[type="time"]').nth(0).fill("12:00");
  await page.locator('input[type="time"]').nth(1).fill("13:00");
  if (spec.type === "reduced" && spec.capacity) await page.getByLabel("Plazas del grupo").fill(String(spec.capacity));
  await page.locator('[data-field="trainer"] button[aria-haspopup="listbox"]').click();
  await page.locator(".tz-select-pop").getByRole("button", { name: spec.trainerName, exact: true }).click();
  if (spec.recurrence) {
    await page.getByRole("button", { name: "No se repite" }).click();
    await page.locator(".tz-select-pop").getByRole("button", { name: spec.recurrence, exact: true }).click();
  }
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
}

async function createSessionViaDialog(page: Page, spec: SessionSpec) {
  await submitSessionDialog(page, spec);
  await expectToast(page, "Sesión creada");
  const session = await db().classSession.findFirst({
    where: { centerId: spec.centerId, name: spec.title },
    select: { id: true },
  });
  expect(session, `la sesión "${spec.title}" no está en la base de datos`).not.toBeNull();
  return session!.id;
}

/** Reserva desde el roster (mostrador): mismo camino que `agenda-reserva-staff.spec.ts`. */
async function staffBookInRoster(page: Page, sessionId: string, dayISO: string, memberName: string) {
  await page.goto(`/agenda/session/${sessionId}?d=${dayISO}`);
  await page.locator('button[aria-haspopup="listbox"]', { hasText: "Elige un socio" }).click();
  await page.locator(".tz-select-pop").getByPlaceholder("Buscar...").fill(memberName);
  await page.locator(".tz-select-pop").getByRole("button", { name: memberName }).first().click();
  await page.getByRole("button", { name: "Reservar plaza" }).click();
}

/** Onboarding de personal (o dueño): contraseña y aterrizaje con sesión iniciada. */
async function activateStaff(page: Page, token: string, password: string) {
  await page.goto(`/onboarding/${token}`);
  await expect(page.getByRole("heading", { name: /Crea tu contraseña/ })).toBeVisible({ timeout: 15_000 });
  await fillNewPassword(page, password);
  await page.getByRole("button", { name: "Continuar →" }).click();
  await expect(page.getByRole("heading", { name: /Todo listo/ })).toBeVisible({ timeout: 15_000 });
}

async function subscriptionOf(memberId: string, planName: string) {
  return db().subscription.findFirstOrThrow({
    where: { memberId, plan: { name: planName } },
    orderBy: { startDate: "desc" },
  });
}

test.describe.serial("Regresión · organización nueva, de /planes a la asistencia (modo demo)", () => {
  test.skip(process.env.E2E_CLEAN_DB !== "true", "Solo contra una base de datos limpia y desechable: E2E_CLEAN_DB=true.");
  test.describe.configure({ timeout: 180_000 });

  // Estado que se pasa de un paso al siguiente: el recorrido es uno solo.
  let orgId: string;
  let orgSlug: string;
  let centerAId: string;
  let centerBId: string;
  let centerBSlug: string;
  let planMonthlyId: string;
  let planEpId: string;
  let leadPublicId: string;
  let sociaId: string;
  let assessmentId: string;
  let group4Id: string;
  let epId: string;
  const fillers: FillerMember[] = [];
  let fillerEp: FillerMember;
  let sociaCancelledBookingId: string;
  let jobsRun: Promise<{ status: number }> | null = null;

  test.beforeAll(async () => {
    // PROD-01: el modo demo ya no se deduce de que falte la clave de Stripe; se
    // pide con dos banderas. Se comprueban en ESTE proceso (playwright.config.ts
    // carga el mismo .env que lee el servidor): sin ellas /planes iría a Stripe
    // y el recorrido probaría otra cosa.
    if (process.env.DEMO_MODE !== "true" || process.env.ALLOW_DEMO_IN_PRODUCTION !== "true") {
      throw new Error(
        "Este recorrido exige modo demo explícito: DEMO_MODE=true y ALLOW_DEMO_IN_PRODUCTION=true " +
          "(en el .env del servidor y en el entorno de Playwright). Para el bloque de Stripe usa --grep @stripe."
      );
    }
    await assertCleanDatabase({ requireEmpty: true });
    serverLogPath();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("O1 · /planes → Avanzado → pago simulado crea la organización ACTIVE y su OWNER", async ({ page }) => {
    await page.goto("/planes");
    await page.getByRole("button", { name: "Contratar Avanzado" }).click();
    await page.waitForURL(/\/demo-checkout\?plan=avanzado_mes/, { timeout: 15_000 });

    await page.getByLabel("Nombre del centro o de quien lo dirige").fill(ORG_NAME);
    await page.getByLabel("Email", { exact: true }).fill(OWNER_EMAIL);
    await page.getByRole("button", { name: "Pagar (simulado)" }).click();
    // El pago simulado lleva directamente al enlace de activación.
    await page.waitForURL(/\/onboarding\//, { timeout: 15_000 });

    const org = await db().organization.findFirstOrThrow({ where: { billingEmail: OWNER_EMAIL } });
    expect(org.name).toBe(ORG_NAME);
    expect(org.platformStatus).toBe("ACTIVE");
    expect(org.platformPlan).toBe("avanzado_mes");
    orgId = org.id;
    orgSlug = org.slug;

    const owner = await db().user.findFirstOrThrow({ where: { orgId, email: OWNER_EMAIL } });
    expect(owner.role).toBe("OWNER");
    expect(owner.centerId).toBeNull();
    await pendingInvitationToken(orgId, OWNER_EMAIL, "OWNER");

    await expectMailLogged(OWNER_EMAIL, new RegExp(`^Tu plataforma está lista — ${escapeRe(ORG_NAME)}$`));
  });

  test("O2 · el OWNER activa su cuenta y aterriza en la puesta en marcha con los canales de lead resueltos", async ({
    page,
  }) => {
    const token = await pendingInvitationToken(orgId, OWNER_EMAIL, "OWNER");
    await activateStaff(page, token, OWNER_PASSWORD);
    await page.waitForURL(/\/puesta-en-marcha/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Pon en marcha tu centro" })).toBeVisible();

    // P10 · QA-ALTA-02: la organización nace con canales de lead por defecto y
    // el paso del checklist sale ya tachado.
    await expect(page.locator("li", { hasText: /Canales de captación/ }).locator(".line-through")).toBeVisible({
      timeout: 5_000,
    });
    expect(await db().leadChannel.count({ where: { orgId } })).toBeGreaterThan(0);
  });

  test("O3 · centros A y B con ficha pública y aforo, el cuarto se bloquea por plan, y el catálogo", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    const createForm = page.locator("form", { has: page.getByRole("button", { name: "Añadir centro" }) });
    const addCenter = async (name: string, address: string) => {
      await fieldInput(createForm, "Nombre del centro").fill(name);
      await fieldInput(createForm, "Dirección").fill(address);
      await createForm.getByRole("button", { name: "Añadir centro" }).click();
    };

    await addCenter(CENTER_A, "Calle Alfonso I 10, Zaragoza");
    await expect(page.getByRole("heading", { level: 3, name: CENTER_A, exact: true })).toBeVisible({ timeout: 15_000 });
    await addCenter(CENTER_B, "Paseo Sagasta 20, Zaragoza");
    await expect(page.getByRole("heading", { level: 3, name: CENTER_B, exact: true })).toBeVisible({ timeout: 15_000 });
    // Avanzado incluye tres: el tercero entra y el cuarto se rechaza.
    await addCenter(CENTER_C, "Calle Delicias 30, Zaragoza");
    await expect(page.getByRole("heading", { level: 3, name: CENTER_C, exact: true })).toBeVisible({ timeout: 15_000 });
    await addCenter(CENTER_D, "Calle Oliver 40, Zaragoza");
    await expectToast(page, "Tu plan Avanzado incluye 3 centros. Para añadir más, cambia de plan.");
    expect(await db().center.count({ where: { orgId } })).toBe(3);

    const centersSection = page.locator("section", { has: page.getByRole("heading", { name: "Centros", exact: true }) });
    const card = (name: string) =>
      centersSection.locator("div.grid > div").filter({ has: page.getByRole("heading", { level: 3, name, exact: true }) });

    for (const [name, capacity, phone] of [
      [CENTER_A, "10", "976111111"],
      [CENTER_B, "6", "976222222"],
    ] as const) {
      const c = card(name);
      const capacityForm = c.locator("form", { has: page.getByLabel("Aforo por defecto") });
      await fieldInput(capacityForm, "Aforo por defecto").fill(capacity);
      await capacityForm.getByRole("button", { name: "Guardar", exact: true }).click();
      await expectToast(page, "Aforo por defecto actualizado.");
      // El toast del centro anterior puede seguir en pantalla: se espera al dato.
      await expect
        .poll(async () => (await db().center.findFirst({ where: { orgId, name } }))?.defaultGroupCapacity, { timeout: 15_000 })
        .toBe(Number(capacity));

      await c.locator("summary", { hasText: "Página pública y enlaces" }).click();
      await fieldInput(c, "Teléfono").fill(phone);
      await fieldInput(c, "Horario").fill("Lunes: 07:00-22:00\nSábado: 09:00-14:00\nDomingo: cerrado");
      await fieldInput(c, "Descripción").fill(`Entrenamiento personal y grupos reducidos en ${name}.`);
      await c.getByRole("checkbox", { name: /Publicar la página de este centro/ }).check();
      await c.getByRole("button", { name: "Guardar ficha pública" }).click();
      await expectToast(page, "Ficha pública actualizada.");
      await expect
        .poll(async () => (await db().center.findFirst({ where: { orgId, name } }))?.publicPage, { timeout: 15_000 })
        .toBe(true);
    }

    const centerA = await db().center.findFirstOrThrow({ where: { orgId, name: CENTER_A } });
    const centerB = await db().center.findFirstOrThrow({ where: { orgId, name: CENTER_B } });
    expect(centerA.defaultGroupCapacity).toBe(10);
    expect(centerA.phone).toBe("976111111");
    expect(centerA.publicPage).toBe(true);
    expect(centerA.openingHours).not.toBeNull();
    expect(centerB.defaultGroupCapacity).toBe(6);
    expect(centerB.publicPage).toBe(true);
    centerAId = centerA.id;
    centerBId = centerB.id;
    centerBSlug = centerB.slug;

    // Catálogo. OJO: un MONTHLY cubre sesiones de GRUPO, no de EP
    // (session-balance.ts): "Mensual EP 8" se gasta en grupos (R2, R3, C4) y la
    // EP de R6 tira de "Bono 5 EP".
    const productForm = page.locator("form", { has: page.getByRole("button", { name: "Crear producto" }) });
    const addProduct = async (name: string, type: string, price: string, sessions: string) => {
      await fieldByLabel(productForm, "Nombre").locator("input").fill(name);
      await chooseInField(page, fieldByLabel(productForm, "Tipo"), type);
      await fieldInput(productForm, "Precio (€)").fill(price);
      await fieldInput(productForm, "Sesiones incluidas").fill(sessions);
      await productForm.getByRole("button", { name: "Crear producto" }).click();
      await expect
        .poll(() => db().membershipPlan.count({ where: { orgId, name } }), { timeout: 15_000 })
        .toBe(1);
    };
    await addProduct(PLAN_MONTHLY, "Cuota mensual", "160", "8");
    await addProduct(PLAN_EP, "Entrenamiento personal", "200", "5");

    const monthly = await db().membershipPlan.findFirstOrThrow({ where: { orgId, name: PLAN_MONTHLY } });
    expect(monthly.type).toBe("MONTHLY");
    expect(monthly.sessionsIncluded).toBe(8);
    expect(monthly.priceCents).toBe(16_000);
    const ep = await db().membershipPlan.findFirstOrThrow({ where: { orgId, name: PLAN_EP } });
    expect(ep.type).toBe("PERSONAL_TRAINING");
    expect(ep.sessionsIncluded).toBe(5);
    planMonthlyId = monthly.id;
    planEpId = ep.id;
  });

  test("E1 · alta del equipo: dos entrenadores y la dirección del centro B, con invitación", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    const newStaff = async (name: string, email: string, role: string, center: string) => {
      await page.getByRole("button", { name: "+ Nueva persona" }).click();
      const dialog = page.getByRole("dialog", { name: "Nueva persona" });
      await dialog.locator('input[name="name"]').fill(name);
      await dialog.locator('input[name="email"]').fill(email);
      await chooseInField(page, fieldByLabel(dialog, "Rol"), role);
      await chooseInField(page, fieldByLabel(dialog, "Centro base"), center);
      await dialog.getByRole("button", { name: "Guardar y enviar invitación" }).click();
      await expectToast(page, "Persona creada");
      // El drawer no se desmonta: se desliza fuera y queda `inert`.
      await expect(dialog).toHaveAttribute("inert", "");
    };
    await newStaff(TRAINER1.name, TRAINER1.email, "Entrenador", CENTER_A);
    await newStaff(TRAINER2.name, TRAINER2.email, "Entrenador", CENTER_A);
    await newStaff(DIRECTOR_B.name, DIRECTOR_B.email, "Dirección de centro", CENTER_B);

    // El Entrenador 2 trabaja en A (base) y además en B.
    const assignForm = page.locator("form", { has: page.getByRole("button", { name: "Imputar a centro" }) });
    await chooseInField(page, fieldByLabel(assignForm, "Persona"), `${TRAINER2.name} · Entrenador`);
    await chooseInField(page, fieldByLabel(assignForm, "Centro"), CENTER_B);
    await assignForm.getByRole("button", { name: "Imputar a centro" }).click();
    await expectToast(page, "Imputación guardada.");

    const expectations = [
      { ...TRAINER1, role: "TRAINER", centerId: centerAId },
      { ...TRAINER2, role: "TRAINER", centerId: centerAId },
      { ...DIRECTOR_B, role: "CENTER_DIRECTOR", centerId: centerBId },
    ];
    for (const person of expectations) {
      const user = await db().user.findFirstOrThrow({ where: { orgId, email: person.email } });
      expect(user.role).toBe(person.role);
      expect(user.centerId).toBe(person.centerId);
      const primary = await db().centerMembership.findFirstOrThrow({ where: { userId: user.id, isPrimary: true } });
      expect(primary.centerId).toBe(person.centerId);
      expect(primary.allocationPct).toBe(100);
      await pendingInvitationToken(orgId, person.email, "STAFF");
      await expectMailLogged(person.email, new RegExp(`^¡Bienvenida a ${escapeRe(ORG_NAME)}! Tu acceso te espera$`));
    }
    const trainer2 = await db().user.findFirstOrThrow({ where: { orgId, email: TRAINER2.email } });
    expect(await db().centerMembership.count({ where: { userId: trainer2.id, centerId: centerBId } })).toBe(1);
  });

  test("E2 · los tres activan su cuenta y cada uno ve solo su ámbito en la agenda", async ({ page }) => {
    for (const person of [TRAINER1, TRAINER2, DIRECTOR_B]) {
      const token = await pendingInvitationToken(orgId, person.email, "STAFF");
      await activateStaff(page, token, STAFF_PASSWORD);
      await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"), { timeout: 15_000 });
      const used = await db().invitation.findFirstOrThrow({ where: { token } });
      expect(used.usedAt).not.toBeNull();
    }

    const switcher = (center: string) => page.locator('button[aria-haspopup="listbox"]', { hasText: center });

    // Entrenador 1: solo A, sin selector de centro.
    await loginAs(page, TRAINER1.email, STAFF_PASSWORD);
    await page.goto("/agenda");
    await expect(page.getByRole("button", { name: /Nueva sesión/ }).first()).toBeVisible({ timeout: 15_000 });
    await expect(switcher(CENTER_A)).toHaveCount(0);
    await expect(switcher(CENTER_B)).toHaveCount(0);

    // Entrenador 2: A y B, y cambia de centro con el selector.
    await loginAs(page, TRAINER2.email, STAFF_PASSWORD);
    await page.goto(`/agenda?center=${centerAId}`);
    await switcher(CENTER_A).click();
    await page.locator(".tz-select-pop").getByRole("button", { name: CENTER_B, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`center=${centerBId}`));

    // Dirección de B: pedir A por URL la deja en B. Se ve en quién puede
    // impartir una sesión nueva: el Entrenador 2 (imputado a B), no el 1.
    await loginAs(page, DIRECTOR_B.email, STAFF_PASSWORD);
    await page.goto(`/agenda?center=${centerAId}`);
    await expect(switcher(CENTER_A)).toHaveCount(0);
    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    await page.locator('[data-field="trainer"] button[aria-haspopup="listbox"]').click();
    const options = page.locator(".tz-select-pop");
    await expect(options.getByRole("button", { name: TRAINER2.name, exact: true })).toBeVisible();
    await expect(options.getByRole("button", { name: TRAINER1.name, exact: true })).toHaveCount(0);
  });

  test("L1 · lead manual en A con el canal \"Instagram\" que la organización trae de serie", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/leads");
    await page.getByRole("button", { name: "+ Nuevo lead" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo lead" });
    await fieldInput(dialog, "Nombre").fill(LEAD_MANUAL.firstName);
    await fieldInput(dialog, "Apellidos").fill(LEAD_MANUAL.lastName);
    await fieldInput(dialog, "Teléfono").fill(LEAD_MANUAL.phone);
    await chooseInField(page, fieldByLabel(dialog, "Centro"), CENTER_A);
    // P10 · QA-ALTA-02: sin canales por defecto la opción no existe y no hay
    // forma de seguir (el guion prohíbe crearla a mano).
    await chooseInField(page, fieldByLabel(dialog, "Canal de origen"), "Instagram");
    await dialog.getByRole("button", { name: "Guardar lead" }).click();
    await expectToast(page, "Lead creado");

    const lead = await db().lead.findFirstOrThrow({ where: { orgId, lastName: LEAD_MANUAL.lastName } });
    expect(lead.centerId).toBe(centerAId);
    expect(lead.channel).toBe("Instagram");
    expect(lead.status).toBe("SIN_CONTACTAR");
  });

  test("L2 · el formulario público de B crea el lead en B, y una organización suspendida no recibe leads", async ({
    page,
  }) => {
    // Primera visita al formulario en todo el recorrido: su contexto se cachea
    // diez minutos, así que antes de L2 nadie lo abre.
    const url = `/lead-form/${orgSlug}/${centerBSlug}`;
    const fillPublicForm = async (lastName: string, email: string) => {
      await fieldInput(page, "Nombre").fill(LEAD_PUBLIC.firstName);
      await fieldInput(page, "Apellidos").fill(lastName);
      await fieldInput(page, "Teléfono").fill(LEAD_PUBLIC.phone);
      await fieldInput(page, "Email (opcional)").fill(email);
      await fieldInput(page, "Fecha de nacimiento").fill(LEAD_PUBLIC.birthDate);
      await fieldInput(page, "Código postal").fill("50008");
      await fieldInput(page, "¿A qué te dedicas?").fill("Enfermero");
      await fieldInput(page, "¿Cuáles son tus objetivos?").fill(LEAD_PUBLIC.goals);
      // P10 · QA-ALTA-02: canal por defecto; sin él no se puede enviar.
      await chooseInField(page, fieldByLabel(page, "¿Cómo nos has conocido?"), "Instagram");
      await page.getByRole("checkbox", { name: /Comunicaciones comerciales\./ }).check();
    };

    await page.goto(url);
    await fillPublicForm(LEAD_PUBLIC.lastName, LEAD_PUBLIC.email);
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(page.getByRole("heading", { name: "¡Gracias!" })).toBeVisible({ timeout: 15_000 });

    const lead = await db().lead.findFirstOrThrow({ where: { orgId, email: LEAD_PUBLIC.email } });
    expect(lead.centerId).toBe(centerBId);
    expect(lead.birthDate?.toISOString().slice(0, 10)).toBe(LEAD_PUBLIC.birthDate);
    expect(lead.goals).toBe(LEAD_PUBLIC.goals);
    expect(lead.channel).toBe("Instagram");
    const consent = await db().auditLog.findFirstOrThrow({
      where: { orgId, action: "LEAD_MARKETING_CONSENT_RECORDED", entityId: lead.id },
    });
    expect(consent.metadata).toMatchObject({ granted: true });
    leadPublicId = lead.id;

    // Organización suspendida: el formulario se rellena ANTES de suspenderla
    // (la página está cacheada) y lo que se prueba es la acción al enviar.
    await page.reload();
    await fillPublicForm(`Suspendida ${TAG}`, LEAD_SUSPENDED_EMAIL);
    await db().organization.update({ where: { id: orgId }, data: { platformStatus: "SUSPENDED" } });
    try {
      await page.getByRole("button", { name: "Enviar solicitud" }).click();
      await expect(page.getByRole("heading", { name: "¡Gracias!" }).or(toast(page)).first()).toBeVisible({
        timeout: 15_000,
      });
      // P10 · QA-ALTA-02: una organización suspendida no capta leads.
      expect(await db().lead.count({ where: { orgId, email: LEAD_SUSPENDED_EMAIL } })).toBe(0);
    } finally {
      await db().organization.update({ where: { id: orgId }, data: { platformStatus: "ACTIVE" } });
    }
  });

  test("L4 · la dirección de B convierte el lead en socio con sus datos y le llega la bienvenida", async ({ page }) => {
    await loginAs(page, DIRECTOR_B.email, STAFF_PASSWORD);
    await page.goto(`/leads/${leadPublicId}`);
    await page.getByRole("button", { name: "Cerrar como Embudo · iniciar alta" }).click();
    await expectToast(page, "Alta iniciada: socio creado en periodo de prueba");

    const member = await db().member.findFirstOrThrow({ where: { orgId, originLeadId: leadPublicId } });
    expect(member.primaryCenterId).toBe(centerBId);
    expect(member.email).toBe(LEAD_PUBLIC.email);
    const lead = await db().lead.findUniqueOrThrow({ where: { id: leadPublicId } });
    expect(lead.convertedMemberId).toBe(member.id);
    await pendingInvitationToken(orgId, LEAD_PUBLIC.email, "MEMBER");

    // P10 · QA-ALTA-02: el socio hereda del lead la fecha de nacimiento, los
    // objetivos y el consentimiento de marketing, y recibe la bienvenida.
    expect(member.birthDate?.toISOString().slice(0, 10)).toBe(LEAD_PUBLIC.birthDate);
    expect(member.consentMarketing).toBe(true);
    expect(await db().clientGoal.count({ where: { memberId: member.id } })).toBeGreaterThan(0);
    await expectMailLogged(LEAD_PUBLIC.email, new RegExp(`^¡Bienvenida a ${escapeRe(ORG_NAME)}, `));
  });

  test("S1 · alta de socio en A con foto, teléfono y nacimiento, y bienvenida enviada", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/members");
    await page.getByRole("button", { name: "+ Nuevo socio" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo socio" });
    await dialog.locator('input[type="file"]').setInputFiles({ name: "socia.png", mimeType: "image/png", buffer: TINY_PNG });
    // El dropzone convierte la imagen en data URL de forma asíncrona.
    await expect(dialog.locator('input[name="photoUrl"]')).toHaveValue(/^data:image\/png/);
    await dialog.locator('input[name="firstName"]').fill(SOCIA.firstName);
    await dialog.locator('input[name="lastName"]').fill(SOCIA.lastName);
    await dialog.locator('input[name="email"]').fill(SOCIA.email);
    await dialog.locator('input[name="phone"]').fill(SOCIA.phone);
    await dialog.locator('input[name="birthDate"]').fill(SOCIA.birthDate);
    await chooseInField(page, fieldByLabel(dialog, "Centro"), CENTER_A);
    await dialog.getByRole("button", { name: "Guardar y enviar bienvenida" }).click();
    await expectToast(page, "Socio creado");

    const member = await db().member.findFirstOrThrow({ where: { orgId, email: SOCIA.email } });
    expect(member.primaryCenterId).toBe(centerAId);
    expect(member.photoUrl).toMatch(/^data:image/);
    expect(member.phone).toBe(SOCIA.phone);
    expect(member.birthDate?.toISOString().slice(0, 10)).toBe(SOCIA.birthDate);
    sociaId = member.id;
    await pendingInvitationToken(orgId, SOCIA.email, "MEMBER");
    await expectMailLogged(
      SOCIA.email,
      new RegExp(`^¡Bienvenida a ${escapeRe(ORG_NAME)}, ${escapeRe(SOCIA.firstName)}! 🎉 Tu acceso te espera$`)
    );
  });

  test("S2 · la socia completa el onboarding con sus consentimientos y el muro de primera sesión", async ({
    page,
    request,
  }) => {
    const token = await pendingInvitationToken(orgId, SOCIA.email, "MEMBER");
    await page.goto(`/onboarding/${token}`);
    await fillNewPassword(page, MEMBER_PASSWORD);
    await page.getByRole("button", { name: "Continuar →" }).click();
    await expect(page.getByRole("heading", { name: "Tus datos, tus reglas" })).toBeVisible();
    for (const consent of [/^Datos de salud/, /^Contrato de servicios/, /^Uso de imágenes/, /^Comunicaciones/]) {
      await page.getByRole("checkbox", { name: consent }).check();
    }

    // V1 · el cron diario corre A LA VEZ que el onboarding: los dos abren la
    // valoración inicial, y solo tiene que quedar una.
    const cronSecret = process.env.JOBS_CRON_SECRET;
    expect(cronSecret, "Falta JOBS_CRON_SECRET: V1 dispara el cron en paralelo al onboarding.").toBeTruthy();
    jobsRun = request
      .get("/api/jobs/run", { headers: { "x-cron-secret": cronSecret! }, timeout: 120_000 })
      .then((res) => ({ status: res.status() }));
    await page.getByRole("button", { name: "Guardar y entrar →" }).click();
    await expect(page.getByRole("heading", { name: /Todo listo/ })).toBeVisible({ timeout: 15_000 });

    // Muro de la primera sesión: la fecha de nacimiento ya vino del alta, y la
    // declaración de salud solo se pide a quien NO consintió el tratamiento de
    // salud (`needsHealthDeclaration`), así que aquí queda el contacto de
    // emergencia.
    await expect(page.getByRole("heading", { name: "Nos faltan un par de datos" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: "Declaración de salud" })).toHaveCount(0);
    await fieldInput(page, "Contacto de emergencia").fill("Luis Socia — 600777888");
    await page.getByRole("button", { name: "Continuar →" }).click();
    // Pasado el muro, el portal abre con el aviso de valoración pendiente (con salida).
    await expect(page.getByRole("dialog").filter({ hasText: "Valoración pendiente" })).toBeVisible({ timeout: 15_000 });

    const member = await db().member.findUniqueOrThrow({ where: { id: sociaId } });
    expect(member.userId).not.toBeNull();
    expect(member.consentHealth).toBe(true);
    expect(member.consentContract).toBe(true);
    expect(member.consentImages).toBe(true);
    expect(member.consentMarketing).toBe(true);
    expect(member.emergencyContact).toContain("600777888");

    // P8 · los consentimientos quedan en el registro de auditoría.
    expect(
      await db().auditLog.count({ where: { orgId, memberId: sociaId, action: { contains: "CONSENT" } } })
    ).toBeGreaterThan(0);

    // P8 · el SERVIDOR exige el consentimiento de salud: la pantalla ya lo
    // impide, pero la acción es invocable por sí misma.
    const probe = await createInvitedMember({
      orgId,
      centerId: centerAId,
      firstName: "Sin",
      lastName: `Salud ${TAG}`,
      email: `sin.salud.${TAG}@org-nueva-e2e.es`,
    });
    const withoutHealth = await completeMemberOnboarding(probe.token, {
      password: MEMBER_PASSWORD,
      // Con el contrato aceptado: el rechazo tiene que ser por la salud y nada más.
      consentContract: true,
      consentHealth: false,
      consentImages: false,
      consentMarketing: false,
      consentAI: false,
    });
    expect(withoutHealth.ok, "el onboarding sin consentimiento de salud debe rechazarse").toBe(false);
  });

  test("V1 · existe UNA valoración inicial aunque el cron y el onboarding corran a la vez", async () => {
    expect(jobsRun, "S2 no llegó a lanzar el cron").not.toBeNull();
    expect((await jobsRun!).status).toBe(200);
    const initial = await db().assessment.findMany({ where: { memberId: sociaId, kind: "INITIAL" } });
    // P8 · la creación de la INITIAL es idempotente también en carrera.
    expect(initial).toHaveLength(1);
    expect(initial.length).toBeGreaterThan(0);
    assessmentId = initial[0].id;
  });

  test("V2 · la socia rellena su parte de la valoración inicial", async ({ page }) => {
    await loginAs(page, SOCIA.email, MEMBER_PASSWORD);
    await page.goto(`/portal/valoracion/${assessmentId}`);
    await fieldInput(page, "Edad").fill("36");
    await fieldInput(page, "Altura (cm)").fill("168");
    await fieldInput(page, "Tu objetivo principal").fill("Correr una media maratón sin lesionarme");
    await fieldInput(page, "Peso (kg)").fill("63");
    await chooseInField(page, fieldByLabel(page, "Nivel de actividad actual"), "Alto — entreno con regularidad");
    await chooseInField(page, fieldByLabel(page, "¿Cuántos días por semana puedes entrenar?"), "3 días");
    await chooseInField(page, fieldByLabel(page, "Calidad del sueño"), "4 — alta");
    await chooseInField(page, fieldByLabel(page, "Nivel de estrés"), "2 — baja");
    await chooseInField(page, fieldByLabel(page, "Energía"), "4 — alta");

    // P8-7 · la rutina son los días por semana y el nivel de actividad (ya
    // arriba); la profesión se pregunta aquí y cae en `Member.occupation`, no en
    // `answers`. P8 dejó la pregunta para los formularios del socio y en release
    // sigue sin estar: falla a propósito hasta que se añada.
    const occupation = page.getByLabel(/Profesión|Ocupación|A qué te dedicas/i);
    await expect.soft(occupation).toBeVisible({ timeout: 2_000 });
    if (await occupation.count()) await occupation.first().fill("Enfermera");

    await page.getByRole("button", { name: "Guardar mi valoración →" }).click();
    await expect(page.getByText("¡Gracias!", { exact: true })).toBeVisible({ timeout: 15_000 });

    const assessment = await db().assessment.findUniqueOrThrow({ where: { id: assessmentId } });
    expect(assessment.memberPartAt).not.toBeNull();
    expect(assessment.answers).toMatchObject({
      diasPorSemana: "3",
      perfil: { objetivoPrincipal: "Correr una media maratón sin lesionarme" },
      experiencia: { nivelActividad: "ALTO" },
    });
    expect.soft((await db().member.findUniqueOrThrow({ where: { id: sociaId } })).occupation).toBe("Enfermera");
  });

  test("V3 · el entrenador cierra la valoración y se propaga sin tocar el consentimiento de imagen", async ({ page }) => {
    const startedAt = new Date();
    await loginAs(page, TRAINER1.email, STAFF_PASSWORD);
    await page.goto(`/members/${sociaId}/valoraciones/${assessmentId}`);
    await fieldInput(page, "Peso (kg)").fill("63.5");
    await fieldInput(page, "Lesiones actuales").fill("Molestia leve en el hombro derecho");
    await fieldInput(page, "Dominadas (reps)").fill("4");
    await page.getByRole("checkbox", { name: /PAR-Q y consentimiento de datos de salud/ }).check();
    await page.getByRole("button", { name: "Guardar valoración" }).click();
    await expectToast(page, "Valoración guardada.");

    const assessment = await db().assessment.findUniqueOrThrow({ where: { id: assessmentId } });
    expect(assessment.completedAt).not.toBeNull();
    expect(
      await db().memberProgressEntry.count({ where: { memberId: sociaId, source: "ASSESSMENT", createdAt: { gte: startedAt } } })
    ).toBeGreaterThan(0);
    expect(await db().performanceMetric.count({ where: { memberId: sociaId, createdAt: { gte: startedAt } } })).toBeGreaterThan(0);
    expect(await db().clientGoal.count({ where: { memberId: sociaId } })).toBeGreaterThan(0);
    expect(await db().healthRecord.count({ where: { memberId: sociaId, reportedAt: { gte: startedAt } } })).toBeGreaterThan(0);

    // P8 · cerrar la valoración no puede apagar el consentimiento de imagen
    // que la socia dio en su onboarding.
    const member = await db().member.findUniqueOrThrow({ where: { id: sociaId } });
    expect(member.consentImages).toBe(true);
  });

  test("C1 · la socia compra \"Mensual EP 8\" desde su portal (pago de demostración)", async ({ page }) => {
    await loginAs(page, SOCIA.email, MEMBER_PASSWORD);
    await page.goto("/portal/membresia");
    const row = page
      .locator("div")
      .filter({ has: page.getByText(PLAN_MONTHLY, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Elegir" }) })
      .last();
    await row.getByRole("button", { name: "Elegir" }).click();
    await page.waitForURL(/\/demo-checkout\/socio\?t=/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Confirmar (simulado)" }).click();
    await page.waitForURL(/\/portal\/membresia\?checkout=success/, { timeout: 15_000 });

    const sub = await subscriptionOf(sociaId, PLAN_MONTHLY);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.sessionsRemaining).toBe(8);
    expect(sub.centerId).toBe(centerAId);
    const purchase = await db().sessionLedger.findMany({ where: { subscriptionId: sub.id } });
    expect(purchase).toEqual([expect.objectContaining({ reason: "PURCHASE", delta: 8 })]);
    const payment = await db().payment.findFirstOrThrow({ where: { memberId: sociaId, subscriptionId: sub.id } });
    expect(payment.status).toBe("PAID");
    expect(payment.stripeCheckoutSessionId).toMatch(/^demo_cs_/);
  });

  test("R1 · dirección crea las sesiones de A y de B, y una sin entrenador también se ve", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    epId = await createSessionViaDialog(page, {
      centerId: centerAId,
      type: "personal",
      title: T_EP,
      dateISO: DAY_EP,
      trainerName: TRAINER1.name,
    });
    group4Id = await createSessionViaDialog(page, {
      centerId: centerAId,
      type: "reduced",
      title: T_GROUP4,
      dateISO: DAY_GROUP4,
      capacity: 4,
      trainerName: TRAINER1.name,
      recurrence: "Cada semana",
    });
    const class10Id = await createSessionViaDialog(page, {
      centerId: centerAId,
      type: "reduced",
      title: T_CLASS10,
      dateISO: DAY_CLASS10,
      capacity: 10,
      trainerName: TRAINER2.name,
      recurrence: "Cada semana",
    });

    for (const [title, day] of [
      [T_EP, DAY_EP],
      [T_GROUP4, DAY_GROUP4],
      [T_CLASS10, DAY_CLASS10],
    ]) {
      await page.goto(`/agenda?center=${centerAId}&week=${day}`);
      await expect(page.locator(`[title="${title}"]`).first()).toBeVisible({ timeout: 15_000 });
    }

    const trainer1 = await db().user.findFirstOrThrow({ where: { orgId, email: TRAINER1.email } });
    const trainer2 = await db().user.findFirstOrThrow({ where: { orgId, email: TRAINER2.email } });
    expect(await db().classSession.findUniqueOrThrow({ where: { id: epId } })).toMatchObject({
      capacity: 1,
      recurrence: "NONE",
      trainerId: trainer1.id,
      centerId: centerAId,
      classType: "Personal Training",
    });
    expect(await db().classSession.findUniqueOrThrow({ where: { id: group4Id } })).toMatchObject({
      capacity: 4,
      recurrence: "WEEKLY",
      trainerId: trainer1.id,
      centerId: centerAId,
    });
    expect(await db().classSession.findUniqueOrThrow({ where: { id: class10Id } })).toMatchObject({
      capacity: 10,
      recurrence: "WEEKLY",
      trainerId: trainer2.id,
    });

    // En B, la dirección del centro con el Entrenador 2.
    await loginAs(page, DIRECTOR_B.email, STAFF_PASSWORD);
    const groupBId = await createSessionViaDialog(page, {
      centerId: centerBId,
      type: "reduced",
      title: T_GROUP_B,
      dateISO: DAY_GROUP4,
      capacity: 6,
      trainerName: TRAINER2.name,
      recurrence: "Cada semana",
    });
    expect(await db().classSession.findUniqueOrThrow({ where: { id: groupBId } })).toMatchObject({
      centerId: centerBId,
      trainerId: trainer2.id,
      recurrence: "WEEKLY",
    });
    await page.goto(`/agenda?week=${DAY_GROUP4}`);
    await expect(page.locator(`[title="${T_GROUP_B}"]`).first()).toBeVisible({ timeout: 15_000 });

    // P6 · una sesión sin entrenador existe (la crea, por ejemplo, un
    // entrenador dado de baja) y la agenda no puede esconderla. Se siembra por
    // base de datos porque el diálogo no ofrece "sin entrenador".
    await db().classSession.create({
      data: {
        orgId,
        centerId: centerAId,
        name: T_NO_TRAINER,
        classType: "Grupo reducido",
        date: dbDay(DAY_NO_TRAINER),
        startTime: "12:00",
        endTime: "13:00",
        capacity: 4,
        trainerId: null,
      },
    });
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto(`/agenda?center=${centerAId}&week=${DAY_NO_TRAINER}`);
    await expect(page.locator(`[title="${T_GROUP4}"]`).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`[title="${T_NO_TRAINER}"]`).first()).toBeVisible({ timeout: 5_000 });
  });

  test("R2 · la socia reserva el grupo semanal: −1 sesión y asiento BOOKING con su reserva", async ({ page }) => {
    await loginAs(page, SOCIA.email, MEMBER_PASSWORD);
    await page.goto(`/portal/agenda?dia=${DAY_GROUP4}`);
    const card = page.getByRole("article", { name: `${T_GROUP4} · 12:00` });
    await card.getByRole("button", { name: "Reservar", exact: true }).click();
    await expectToast(page, "¡Reserva confirmada!");

    const booking = await db().booking.findFirstOrThrow({ where: { sessionId: group4Id, memberId: sociaId } });
    expect(booking.status).toBe("BOOKED");
    const sub = await subscriptionOf(sociaId, PLAN_MONTHLY);
    expect(sub.sessionsRemaining).toBe(7);
    const charge = await db().sessionLedger.findFirstOrThrow({
      where: { subscriptionId: sub.id, reason: "BOOKING" },
      orderBy: { createdAt: "desc" },
    });
    expect(charge.delta).toBe(-1);
    // P9 · el asiento de la reserva del socio lleva su bookingId.
    expect(charge.bookingId).toBe(booking.id);
  });

  test("R3 · grupo lleno → lista de espera → la socia cancela → quien esperaba reclama el hueco", async ({ page }) => {
    for (const label of ["Uno", "Dos", "Tres", "Espera"]) {
      fillers.push(await createFillerMember({ orgId, centerId: centerAId, planId: planMonthlyId, tag: TAG, label }));
    }
    const [f1, f2, f3, waiting] = fillers;
    for (const f of [f1, f2, f3]) await bookAsFiller(f, group4Id, DAY_GROUP4);

    // El quinto se apunta a la lista de espera por su portal.
    await loginAs(page, waiting.email, waiting.password);
    await page.goto(`/portal/agenda?dia=${DAY_GROUP4}`);
    const waitingCard = page.getByRole("article", { name: `${T_GROUP4} · 12:00` });
    await waitingCard.getByRole("button", { name: "Unirme a lista" }).click();
    await expectToast(page, "Te has unido a la lista de espera.");
    const waitlisted = await db().booking.findFirstOrThrow({ where: { sessionId: group4Id, memberId: waiting.memberId } });
    expect(waitlisted.status).toBe("WAITLISTED");
    expect(waitlisted.waitlistPosition).toBe(1);

    // La socia cancela desde "Tus próximas reservas", dentro de la ventana.
    await loginAs(page, SOCIA.email, MEMBER_PASSWORD);
    await page.goto("/portal/agenda");
    const upcoming = page.getByRole("region", { name: "Tus próximas reservas" });
    await upcoming
      .locator("div")
      .filter({ hasText: T_GROUP4 })
      .filter({ has: page.getByRole("button", { name: "Cancelar" }) })
      .last()
      .getByRole("button", { name: "Cancelar" })
      .click();
    await expectToast(page, "Reserva cancelada.");

    const cancelled = await db().booking.findFirstOrThrow({ where: { sessionId: group4Id, memberId: sociaId } });
    expect(cancelled.status).toBe("CANCELLED");
    sociaCancelledBookingId = cancelled.id;
    const sub = await subscriptionOf(sociaId, PLAN_MONTHLY);
    expect(sub.sessionsRemaining).toBe(8);
    const refund = await db().sessionLedger.findFirstOrThrow({
      where: { subscriptionId: sub.id, reason: "CANCELLATION" },
    });
    expect(refund).toMatchObject({ delta: 1, bookingId: cancelled.id });

    // Aviso de hueco a quien espera.
    await expectMailLogged(waiting.email, new RegExp(`^Se ha liberado una plaza · ${escapeRe(T_GROUP4)}$`));

    // Quien esperaba reclama la plaza él mismo.
    await loginAs(page, waiting.email, waiting.password);
    await page.goto(`/portal/agenda?dia=${DAY_GROUP4}`);
    await page
      .getByRole("article", { name: `${T_GROUP4} · 12:00` })
      .getByRole("button", { name: "Se ha liberado un hueco · Reservar" })
      .click();
    await expectToast(page, "¡Reserva confirmada!");

    const claimed = await db().booking.findUniqueOrThrow({ where: { id: waitlisted.id } });
    expect(claimed.status).toBe("BOOKED");
    expect(claimed.waitlistPosition).toBeNull();
    const waitingSub = await subscriptionOf(waiting.memberId, PLAN_MONTHLY);
    expect(waitingSub.sessionsRemaining).toBe(7);
    const claimCharge = await db().sessionLedger.findFirstOrThrow({
      where: { subscriptionId: waitingSub.id, reason: "BOOKING" },
    });
    expect(claimCharge.delta).toBe(-1);
    // P9 · también el asiento del reclamo lleva la reserva.
    expect(claimCharge.bookingId).toBe(claimed.id);
    expect(
      await db().booking.count({ where: { sessionId: group4Id, occurrenceDate: dbDay(DAY_GROUP4), status: "BOOKED" } })
    ).toBe(4);
  });

  test("R6 · el staff reserva EP: rechazo con la franja ocupada, descuento en una libre y corte al moroso", async ({
    page,
  }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);

    // La socia compra en recepción su "Bono 5 EP" en A.
    await page.goto(`/members/${sociaId}`);
    await page.getByRole("tab", { name: "Plan y pagos" }).click();
    await page.getByRole("button", { name: "Añadir bono" }).first().click();
    const addBono = page.locator("p", { hasText: "Añadir bono" }).locator("xpath=..");
    await chooseInField(page, fieldByLabel(addBono, "Plan"), PLAN_EP);
    await chooseInField(page, fieldByLabel(addBono, "Centro"), CENTER_A);
    await addBono.getByRole("button", { name: "Añadir bono" }).click();
    await expectToast(page, "Bono añadido.");
    const epSub = await subscriptionOf(sociaId, PLAN_EP);
    expect(epSub.sessionsRemaining).toBe(5);

    // Un socio de relleno ocupa la EP puntual (1 plaza).
    fillerEp = await createFillerMember({ orgId, centerId: centerAId, planId: planEpId, tag: TAG, label: "Ep" });
    await bookAsFiller(fillerEp, epId, DAY_EP);

    // Asignar a la socia la franja ya ocupada: rechazado por aforo.
    await page.goto(`/agenda?center=${centerAId}&week=${DAY_EP}`);
    await page.locator(`[title="${T_EP}"]`).first().click();
    await expect(page.getByText("Editar sesión")).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-field="member"] button[aria-haspopup="listbox"]').click();
    await page.locator(".tz-select-pop").getByPlaceholder("Buscar...").fill(SOCIA_NAME);
    await page.locator(".tz-select-pop").getByRole("button", { name: SOCIA_NAME, exact: true }).click();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(page).first()).toBeVisible({ timeout: 15_000 });
    // P6 · la franja de EP respeta su aforo cuando la asigna el staff.
    await expect(toast(page).getByText(/completa|aforo|ocupada/i).first()).toBeVisible({ timeout: 5_000 });
    expect(
      await db().booking.count({ where: { sessionId: epId, memberId: sociaId, status: { not: "CANCELLED" } } }),
      "la socia no debe quedar reservada en una EP llena"
    ).toBe(0);

    // EP libre: la reserva del staff descuenta el bono de EP como la del socio.
    await submitSessionDialog(page, {
      centerId: centerAId,
      type: "personal",
      title: T_EP_FREE,
      dateISO: DAY_EP_FREE,
      trainerName: TRAINER1.name,
      memberName: SOCIA_NAME,
    });
    await expectToast(page, "Sesión creada");
    const epFree = await db().classSession.findFirstOrThrow({ where: { centerId: centerAId, name: T_EP_FREE } });
    const epBooking = await db().booking.findFirstOrThrow({ where: { sessionId: epFree.id, memberId: sociaId } });
    expect(epBooking.status).toBe("BOOKED");
    // P6 · descuento del bono de EP con su asiento.
    expect((await subscriptionOf(sociaId, PLAN_EP)).sessionsRemaining).toBe(4);
    expect(
      await db().sessionLedger.count({ where: { subscriptionId: epSub.id, reason: "BOOKING", delta: -1 } })
    ).toBe(1);

    // Moroso: gracia 0 y un impago de hace diez días cortan la reserva del staff.
    await page.goto("/organization");
    const graceForm = page.locator("form", { has: page.getByRole("button", { name: "Guardar periodo de gracia" }) });
    await fieldInput(graceForm, "Periodo de gracia").fill("0");
    await graceForm.getByRole("button", { name: "Guardar periodo de gracia" }).click();
    await expectToast(page, "Periodo de gracia actualizado.");
    const before = await db().member.findUniqueOrThrow({ where: { id: sociaId }, select: { state: true } });
    await db().member.update({
      where: { id: sociaId },
      data: { state: "DELINQUENT", delinquentSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    try {
      await submitSessionDialog(page, {
        centerId: centerAId,
        type: "personal",
        title: T_EP_MOROSO,
        dateISO: DAY_EP_MOROSO,
        trainerName: TRAINER1.name,
        memberName: SOCIA_NAME,
      });
      await expect(toast(page).first()).toBeVisible({ timeout: 15_000 });
      // P6 · la franja de EP pasa por el mismo corte por morosidad que el roster.
      await expect(
        toast(page).getByText(/tiene un recibo sin pagar y el acceso cortado por morosidad/).first()
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await db().member.update({ where: { id: sociaId }, data: { state: before.state, delinquentSince: null } });
      await db().organization.update({ where: { id: orgId }, data: { dunningGraceDays: 7 } });
    }
  });

  test("R10 · el entrenador pasa lista: ATTENDED y NO_SHOW con motivo; WAITLISTED y CANCELLED no pasan a ATTENDED", async ({
    page,
    request,
  }) => {
    const [f1, f2] = fillers;
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    const r10Id = await createSessionViaDialog(page, {
      centerId: centerAId,
      type: "reduced",
      title: T_R10,
      dateISO: DAY_R10,
      capacity: 2,
      trainerName: TRAINER1.name,
    });
    for (const name of [SOCIA_NAME, f1.fullName]) {
      await staffBookInRoster(page, r10Id, DAY_R10, name);
      await expectToast(page, /Plaza reservada/);
    }
    // Sesión llena: alguien en lista de espera, para probar que no tiene
    // check-in. El mostrador no apunta a nadie a la lista y el portal no deja
    // reservar el pasado, así que se siembra (sin coste: la espera no descuenta).
    const waitlisted = await db().booking.create({
      data: {
        sessionId: r10Id,
        occurrenceDate: dbDay(DAY_R10),
        memberId: f2.memberId,
        status: "WAITLISTED",
        waitlistPosition: 1,
      },
    });

    await loginAs(page, TRAINER1.email, STAFF_PASSWORD);
    await page.goto(`/agenda/session/${r10Id}?d=${DAY_R10}`);
    await page.getByRole("row", { name: new RegExp(escapeRe(SOCIA_NAME)) }).getByRole("button", { name: "Marcar check-in" }).click();
    await expectToast(page, "Check-in registrado.");

    await page.getByRole("button", { name: `Marcar que ${f1.fullName} no asistió` }).click();
    const noShow = page.getByRole("dialog", { name: `Marcar falta de ${f1.fullName}` });
    await noShow.getByLabel("Motivo").click();
    await page.locator(".tz-select-pop").getByRole("button", { name: /^No avisó/ }).click();
    await noShow.getByRole("button", { name: "Marcar falta" }).click();

    await expect
      .poll(async () => (await db().booking.findFirstOrThrow({ where: { sessionId: r10Id, memberId: sociaId } })).status, {
        timeout: 15_000,
      })
      .toBe("ATTENDED");
    const attended = await db().booking.findFirstOrThrow({ where: { sessionId: r10Id, memberId: sociaId } });
    expect(attended.checkedInAt).not.toBeNull();
    await expect
      .poll(async () => (await db().booking.findFirstOrThrow({ where: { sessionId: r10Id, memberId: f1.memberId } })).status, {
        timeout: 15_000,
      })
      .toBe("NO_SHOW");
    const missed = await db().booking.findFirstOrThrow({ where: { sessionId: r10Id, memberId: f1.memberId } });
    expect(missed.noShowReason).toBe("FORGOT");

    // La lista de espera no ofrece check-in.
    await page.reload();
    const waitlistBlock = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: /^Lista de espera/ }) })
      .last();
    await expect(waitlistBlock.getByRole("link", { name: f2.fullName })).toBeVisible();
    await expect(waitlistBlock.getByRole("button", { name: /check-in/i })).toHaveCount(0);

    // Y el servidor tampoco lo acepta por la puerta de la app (debrief), ni
    // para la reserva en espera ni para la que la socia canceló en R3.
    const trainerApi = await mobileLogin(request, TRAINER1.email, STAFF_PASSWORD);
    for (const [sessionId, bookingId, status] of [
      [r10Id, waitlisted.id, "WAITLISTED"],
      [group4Id, sociaCancelledBookingId, "CANCELLED"],
    ] as const) {
      const res = await request.post(`/api/mobile/v1/trainer/brief/${sessionId}/debrief`, {
        headers: bearer(trainerApi),
        data: { bookingId, feeling: "GREEN" },
      });
      expect(res.ok(), `el debrief sobre una reserva ${status} debe rechazarse`).toBe(false);
      expect((await db().booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(status);
    }
  });

  test("C4 · la socia consume su bono hasta 0 y la siguiente reserva se bloquea", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    const seriesId = await createSessionViaDialog(page, {
      centerId: centerAId,
      type: "reduced",
      title: T_C4,
      dateISO: C4_BASE,
      capacity: 10,
      trainerName: TRAINER2.name,
      recurrence: "Todos los días laborables (L–V)",
    });
    expect((await db().classSession.findUniqueOrThrow({ where: { id: seriesId } })).recurrence).toBe("WEEKDAYS");

    // Días laborables ya pasados de la serie: reservar desde el mostrador (sin
    // ventana de autoservicio) y pasar lista, hasta dejar el bono a cero.
    const pastWeekdays: string[] = [];
    for (let d = C4_BASE; d < madridDay(0); d = addDaysISO(d, 1)) {
      if (weekdayOf(d) >= 1 && weekdayOf(d) <= 5) pastWeekdays.push(d);
    }
    const remaining = async () => (await subscriptionOf(sociaId, PLAN_MONTHLY)).sessionsRemaining ?? 0;
    const toConsume = await remaining();
    expect(toConsume).toBeGreaterThan(0);
    expect(pastWeekdays.length).toBeGreaterThan(toConsume);

    for (const day of pastWeekdays.slice(0, toConsume)) {
      await staffBookInRoster(page, seriesId, day, SOCIA_NAME);
      await expectToast(page, /Plaza reservada/);
      await page.getByRole("row", { name: new RegExp(escapeRe(SOCIA_NAME)) }).getByRole("button", { name: "Marcar check-in" }).click();
      await expectToast(page, "Check-in registrado.");
    }
    expect(await remaining()).toBe(0);

    // La siguiente, bloqueada desde el mostrador…
    await staffBookInRoster(page, seriesId, pastWeekdays[toConsume], SOCIA_NAME);
    await expectToast(page, "A ese socio no le quedan sesiones en su bono.");

    // …y desde el portal.
    let future = madridDay(2);
    while (weekdayOf(future) === 0 || weekdayOf(future) === 6) future = addDaysISO(future, 1);
    await loginAs(page, SOCIA.email, MEMBER_PASSWORD);
    await page.goto(`/portal/agenda?dia=${future}`);
    await page.getByRole("article", { name: `${T_C4} · 12:00` }).getByRole("button", { name: "Reservar", exact: true }).click();
    await expectToast(page, "No te quedan sesiones en tu bono. Renueva tu bono para seguir reservando.");

    const sub = await subscriptionOf(sociaId, PLAN_MONTHLY);
    expect(sub.sessionsRemaining).toBe(0);
    const ledger = await db().sessionLedger.aggregate({ where: { subscriptionId: sub.id }, _sum: { delta: true } });
    expect(ledger._sum.delta).toBe(0);
  });
});

// ─── Bloque @stripe ──────────────────────────────────────────────────────────

const S_TAG = `${TAG}s`;
const S_ORG_NAME = `Org Stripe E2E ${S_TAG}`;
const S_OWNER_EMAIL = `owner.${S_TAG}@org-nueva-e2e.es`;
const S_CENTER = `Centro Stripe ${S_TAG}`;
const S_PLAN = `Mensual EP 8 Stripe ${S_TAG}`;
const S_SOCIO = { firstName: "Irene", lastName: `Stripe ${S_TAG}`, email: `socia.stripe.${S_TAG}@org-nueva-e2e.es` };

/** Reenvío de un evento de la cuenta conectada con su MISMO `id`, firmado como lo firmaría `stripe listen`. */
async function redeliverConnectEvent(request: APIRequestContext, stripe: Stripe, event: Stripe.Event, accountId: string) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET!;
  const payload = JSON.stringify({ ...event, account: accountId });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return request.post("/api/stripe/webhook", {
    headers: { "content-type": "application/json", "stripe-signature": header },
    data: payload,
  });
}

test.describe.serial("Regresión · organización nueva · cobros reales en Stripe (test)", { tag: "@stripe" }, () => {
  test.skip(process.env.E2E_CLEAN_DB !== "true", "Solo contra una base de datos limpia y desechable: E2E_CLEAN_DB=true.");
  test.describe.configure({ timeout: 240_000 });

  let stripe: Stripe;
  let accountId: string;
  let orgId: string;
  let centerId: string;
  let memberId: string;
  let clockId: string;
  let stripeSubscriptionId: string;

  test.beforeAll(async () => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    const whsec = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    accountId = process.env.E2E_STRIPE_CONNECTED_ACCOUNT ?? "";
    const missing = [
      !key.startsWith("sk_test_") && "STRIPE_SECRET_KEY=sk_test_…",
      !whsec.startsWith("whsec_") && "STRIPE_WEBHOOK_SECRET=whsec_… (el de `stripe listen`)",
      !accountId.startsWith("acct_") && "E2E_STRIPE_CONNECTED_ACCOUNT=acct_…",
    ].filter(Boolean);
    if (missing.length) throw new Error(`El bloque @stripe necesita claves de TEST: falta ${missing.join(", ")}.`);
    // PROD-01: con el modo demo activo /planes lleva a /demo-checkout aunque haya clave.
    if (process.env.DEMO_MODE === "true") {
      throw new Error("El bloque @stripe necesita el modo demo apagado: lánzalo (y el servidor) con DEMO_MODE=false.");
    }
    await assertCleanDatabase({ requireEmpty: false });
    serverLogPath();
    stripe = new Stripe(key);
  });

  test.afterAll(async () => {
    if (clockId) await stripe.testHelpers.testClocks.del(clockId, { stripeAccount: accountId });
    await disconnectDb();
  });

  test("C1 · (Stripe) organización por Checkout de test y compra de la cuota en la cuenta conectada", async ({ page }) => {
    // Organización propia: /planes → Checkout alojado → webhook.
    await page.goto("/planes");
    await page.getByRole("button", { name: "Contratar Avanzado" }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await payHostedCheckout(page, { email: S_OWNER_EMAIL, name: S_ORG_NAME, withAddress: true });
    await page.waitForURL(/\/activar\?session_id=/, { timeout: 60_000 });
    await expect
      .poll(async () => (await db().organization.findFirst({ where: { billingEmail: S_OWNER_EMAIL } }))?.platformStatus, {
        timeout: 60_000,
      })
      .toBe("ACTIVE");
    const org = await db().organization.findFirstOrThrow({ where: { billingEmail: S_OWNER_EMAIL } });
    orgId = org.id;

    const ownerToken = await pendingInvitationToken(orgId, S_OWNER_EMAIL, "OWNER");
    await activateStaff(page, ownerToken, OWNER_PASSWORD);
    await page.waitForURL(/\/puesta-en-marcha/, { timeout: 15_000 });

    // O4 (conectar Stripe por OAuth) es manual: se registra la cuenta de test.
    await db().stripeAccount.create({ data: { orgId, accountId, chargesEnabled: true, payoutsEnabled: true } });

    // Lo mínimo: centro, producto MONTHLY (con su Price en la cuenta conectada) y socio.
    await page.goto("/organization");
    const createForm = page.locator("form", { has: page.getByRole("button", { name: "Añadir centro" }) });
    await fieldInput(createForm, "Nombre del centro").fill(S_CENTER);
    await createForm.getByRole("button", { name: "Añadir centro" }).click();
    await expect(page.getByRole("heading", { level: 3, name: S_CENTER, exact: true })).toBeVisible({ timeout: 15_000 });
    centerId = (await db().center.findFirstOrThrow({ where: { orgId, name: S_CENTER } })).id;

    const productForm = page.locator("form", { has: page.getByRole("button", { name: "Crear producto" }) });
    await fieldByLabel(productForm, "Nombre").locator("input").fill(S_PLAN);
    await chooseInField(page, fieldByLabel(productForm, "Tipo"), "Cuota mensual");
    await fieldInput(productForm, "Precio (€)").fill("160");
    await fieldInput(productForm, "Sesiones incluidas").fill("8");
    await productForm.getByRole("button", { name: "Crear producto" }).click();
    await expect
      .poll(async () => (await db().membershipPlan.findFirst({ where: { orgId, name: S_PLAN } }))?.stripePriceId ?? null, {
        timeout: 30_000,
      })
      .toMatch(/^price_/);

    await page.goto("/members");
    await page.getByRole("button", { name: "+ Nuevo socio" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo socio" });
    await dialog.locator('input[name="firstName"]').fill(S_SOCIO.firstName);
    await dialog.locator('input[name="lastName"]').fill(S_SOCIO.lastName);
    await dialog.locator('input[name="email"]').fill(S_SOCIO.email);
    await dialog.locator('input[name="birthDate"]').fill("1988-05-20");
    await chooseInField(page, fieldByLabel(dialog, "Centro"), S_CENTER);
    await dialog.getByRole("button", { name: "Guardar y enviar bienvenida" }).click();
    await expectToast(page, "Socio creado");
    memberId = (await db().member.findFirstOrThrow({ where: { orgId, email: S_SOCIO.email } })).id;

    // Customer con Test Clock en la cuenta conectada, presembrado en la ficha:
    // `createMemberCheckout` reutiliza el que encuentra, y así C8 puede mover
    // el reloj de ESTE cliente.
    const clock = await stripe.testHelpers.testClocks.create(
      { frozen_time: Math.floor(Date.now() / 1000), name: `P12 ${S_TAG}` },
      { stripeAccount: accountId }
    );
    clockId = clock.id;
    const customer = await stripe.customers.create(
      { email: S_SOCIO.email, name: `${S_SOCIO.firstName} ${S_SOCIO.lastName}`, test_clock: clock.id },
      { stripeAccount: accountId }
    );
    await db().member.update({ where: { id: memberId }, data: { stripeCustomerId: customer.id, stripeAccountId: accountId } });

    // La socia activa su cuenta y compra desde el portal.
    const token = await pendingInvitationToken(orgId, S_SOCIO.email, "MEMBER");
    await page.goto(`/onboarding/${token}`);
    await fillNewPassword(page, MEMBER_PASSWORD);
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page.getByRole("checkbox", { name: /^Datos de salud/ }).check();
    await page.getByRole("checkbox", { name: /^Contrato de servicios/ }).check();
    await page.getByRole("button", { name: "Guardar y entrar →" }).click();
    await expect(page.getByRole("heading", { name: "Nos faltan un par de datos" })).toBeVisible({ timeout: 15_000 });
    await fieldInput(page, "Contacto de emergencia").fill("Contacto Stripe — 600999000");
    await page.getByRole("button", { name: "Continuar →" }).click();

    await page.goto("/portal/membresia");
    await page
      .locator("div")
      .filter({ has: page.getByText(S_PLAN, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Elegir" }) })
      .last()
      .getByRole("button", { name: "Elegir" })
      .click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await payHostedCheckout(page, { name: `${S_SOCIO.firstName} ${S_SOCIO.lastName}`, withAddress: false });
    await page.waitForURL(/\/portal\/membresia\?checkout=success/, { timeout: 60_000 });

    // En la app: bono ACTIVE con 8 sesiones y su PURCHASE +8.
    await expect
      .poll(async () => (await db().subscription.findFirst({ where: { memberId, status: "ACTIVE" } }))?.sessionsRemaining ?? null, {
        timeout: 60_000,
      })
      .toBe(8);
    const sub = await db().subscription.findFirstOrThrow({ where: { memberId, status: "ACTIVE" } });
    expect(sub.centerId).toBe(centerId);
    expect(await db().sessionLedger.count({ where: { subscriptionId: sub.id, reason: "PURCHASE", delta: 8 } })).toBe(1);
    await expect
      .poll(() => db().payment.count({ where: { memberId, status: "PAID" } }), { timeout: 60_000 })
      .toBe(1);

    // En Stripe: una suscripción mensual del Customer con el centro en metadata.
    const subs = await stripe.subscriptions.list({ customer: customer.id }, { stripeAccount: accountId });
    expect(subs.data).toHaveLength(1);
    expect(subs.data[0].metadata.centerId).toBe(centerId);
    expect(subs.data[0].items.data[0].price.recurring?.interval).toBe("month");
    stripeSubscriptionId = subs.data[0].id;
    expect(sub.stripeSubscriptionId).toBe(stripeSubscriptionId);
  });

  test("C5 · (Stripe) adelantar la renovación cobra en el acto y reinicia el ciclo", async ({ page }) => {
    const startedAt = Math.floor(Date.now() / 1000);
    const sub = await db().subscription.findFirstOrThrow({ where: { memberId, status: "ACTIVE" } });

    await loginAs(page, S_SOCIO.email, MEMBER_PASSWORD);
    await page.goto("/portal/membresia");
    // P2 · P4: el botón no existe todavía en main.
    await page.getByRole("button", { name: /Adelantar renovación/ }).click();

    await expect.poll(() => db().payment.count({ where: { memberId, status: "PAID" } }), { timeout: 60_000 }).toBe(2);
    await expect
      .poll(() => db().sessionLedger.count({ where: { subscriptionId: sub.id, reason: "PURCHASE" } }), { timeout: 60_000 })
      .toBe(2);
    expect(await db().sessionLedger.count({ where: { subscriptionId: sub.id, reason: "EXPIRY" } })).toBe(1);
    const renewed = await db().subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(renewed.sessionsRemaining).toBe(8);
    const expectedEnd = new Date();
    expectedEnd.setMonth(expectedEnd.getMonth() + 1);
    expect(Math.abs((renewed.endDate?.getTime() ?? 0) - expectedEnd.getTime())).toBeLessThan(2 * 24 * 60 * 60 * 1000);

    const remote = await stripe.subscriptions.retrieve(stripeSubscriptionId, {}, { stripeAccount: accountId });
    expect(Math.abs(remote.billing_cycle_anchor - startedAt)).toBeLessThan(10 * 60);
    // La fecha del próximo cobro se enseña en el portal.
    await page.reload();
    await expect(page.getByText(/Próximo cobro/i)).toBeVisible();
  });

  test("C8 · (Stripe) Test Clock +1 mes: la renovación recarga una sola vez aunque el evento llegue repetido", async ({
    request,
  }) => {
    const sub = await db().subscription.findFirstOrThrow({ where: { memberId, status: "ACTIVE" } });
    const purchasesBefore = await db().sessionLedger.count({ where: { subscriptionId: sub.id, reason: "PURCHASE" } });
    const paymentsBefore = await db().payment.count({ where: { memberId, status: "PAID" } });

    const clock = await stripe.testHelpers.testClocks.retrieve(clockId, {}, { stripeAccount: accountId });
    await stripe.testHelpers.testClocks.advance(
      clockId,
      { frozen_time: clock.frozen_time + 32 * 24 * 60 * 60 },
      { stripeAccount: accountId }
    );
    await expect
      .poll(async () => (await stripe.testHelpers.testClocks.retrieve(clockId, {}, { stripeAccount: accountId })).status, {
        timeout: 120_000,
        intervals: [2_000],
      })
      .toBe("ready");

    // `invoice.paid` (subscription_cycle) → recarga según D3, una vez.
    await expect
      .poll(() => db().sessionLedger.count({ where: { subscriptionId: sub.id, reason: "PURCHASE" } }), { timeout: 60_000 })
      .toBe(purchasesBefore + 1);
    await expect
      .poll(() => db().payment.count({ where: { memberId, status: "PAID" } }), { timeout: 60_000 })
      .toBe(paymentsBefore + 1);
    const afterRenewal = await db().subscription.findUniqueOrThrow({ where: { id: sub.id } });

    // El mismo evento otra vez: se descarta por `event.id` y no recarga.
    const events = await stripe.events.list({ type: "invoice.paid", limit: 20 }, { stripeAccount: accountId });
    const cycle = events.data.find((e) => {
      const invoice = e.data.object as Stripe.Invoice;
      const parentSub = invoice.parent?.subscription_details?.subscription;
      const subId = typeof parentSub === "string" ? parentSub : parentSub?.id;
      return invoice.billing_reason === "subscription_cycle" && subId === stripeSubscriptionId;
    });
    expect(cycle, "no se encuentra el invoice.paid de la renovación").toBeTruthy();
    const res = await redeliverConnectEvent(request, stripe, cycle!, accountId);
    expect(res.ok()).toBe(true);
    expect(await res.json()).toMatchObject({ ok: true, deduplicated: expect.anything() });

    expect(await db().sessionLedger.count({ where: { subscriptionId: sub.id, reason: "PURCHASE" } })).toBe(purchasesBefore + 1);
    expect(await db().payment.count({ where: { memberId, status: "PAID" } })).toBe(paymentsBefore + 1);
    const final = await db().subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(final.sessionsRemaining).toBe(afterRenewal.sessionsRemaining);
  });
});

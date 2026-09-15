import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { FEATURE_BY_ROUTE } from "@/lib/rbac";
import { PLATFORM_PLANS } from "@/lib/platform-plans";
import {
  chargeToRow,
  customerToRow,
  featureForStripeConsoleRoute,
  loadStripeConsoleCards,
  logStripeConsoleOpened,
  nextCursorFor,
  parseStripeConsoleCursors,
  payoutToRow,
  stripeConsoleErrorMessage,
  stripeConsoleHref,
  stripeEnvironment,
  subscriptionToRow,
  STRIPE_CONSOLE_AUDIT_ACTION,
  STRIPE_CONSOLE_FEATURE,
  STRIPE_CONSOLE_LIST_IDS,
  STRIPE_CONSOLE_PAGE_SIZE,
  STRIPE_CONSOLE_ROUTE,
  type StripeConsoleListId,
  type StripeConsoleListPage,
  type StripeConsoleSource,
} from "@/lib/stripe-console";

/**
 * HU-ST-24 · Consola de lectura de Stripe para dirección.
 *
 * Un bloque por escenario de la historia, en su orden, más el gateo por plan
 * que exige `AGENTS.md` (una ruta nueva sin gate declarado falla AQUÍ, no en
 * producción).
 */

const CONSOLE_DIR = join("src", "app", "(app)", "stripe");
const LIB = readFileSync(join("src", "lib", "stripe-console.ts"), "utf8");
const PAGE = readFileSync(join(CONSOLE_DIR, "page.tsx"), "utf8");

const SLUG = "e2e-stripe-console";
let orgId = "";

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Consola Stripe", slug: SLUG } });
  orgId = org.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Rutas reales de la sección, con sus segmentos dinámicos tal cual (`[id]`). */
function consoleRoutes(dir = CONSOLE_DIR, prefix = STRIPE_CONSOLE_ROUTE): { route: string; file: string }[] {
  const found: { route: string; file: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
      found.push(...consoleRoutes(join(dir, entry.name), `${prefix}${segment}`));
    } else if (entry.name === "page.tsx") {
      found.push({ route: prefix, file: join(dir, entry.name) });
    }
  }
  return found;
}

/** Origen de mentira: contesta lo que se le diga y revienta donde se le diga. */
function fakeSource(
  answers: Partial<Record<StripeConsoleListId, StripeConsoleListPage | Error>>,
  options: { livemode?: boolean; onCall?: (id: StripeConsoleListId, params: { limit: number; startingAfter?: string }) => void } = {}
): StripeConsoleSource {
  return {
    livemode: options.livemode ?? false,
    async list(id, params) {
      options.onCall?.(id, params);
      const answer = answers[id];
      if (answer instanceof Error) throw answer;
      return answer ?? { rows: [], hasMore: false };
    },
  };
}

function row(id: string): StripeConsoleListPage["rows"][number] {
  return { id, title: id, subtitle: null, amountCents: 1000, currency: "eur", status: "succeeded", at: null };
}

// ---------------------------------------------------------------------------
// Escenario 1 · Acceso: solo OWNER, y cada apertura queda en AuditLog
// ---------------------------------------------------------------------------

test("escenario «acceso»: la consola solo deja entrar a OWNER", () => {
  const roles = LIB.match(/STRIPE_CONSOLE_ROLES: Role\[\] = \[([^\]]+)\]/);
  assert.ok(roles, "la lista de roles dejó de ser declarativa: revisa este test");
  assert.equal(roles[1].trim(), '"OWNER"', "la historia dice OWNER y solo OWNER");
});

test("escenario «acceso»: la puerta comprueba rol Y plan, en un solo sitio", () => {
  const guard = LIB.slice(LIB.indexOf("export async function requireStripeConsole"));
  assert.match(guard, /requireRole\(STRIPE_CONSOLE_ROLES\)/);
  assert.match(guard, /requireFeature\(STRIPE_CONSOLE_FEATURE\)/);
});

test("escenario «acceso»: TODA pantalla de la consola pasa por la puerta", () => {
  const offenders = consoleRoutes().filter(({ file }) => !/requireStripeConsole\(/.test(readFileSync(file, "utf8")));
  assert.deepEqual(
    offenders.map((o) => o.route),
    [],
    "Estas pantallas de /stripe no llaman a requireStripeConsole(), así que se abren escribiendo la URL: " +
      offenders.map((o) => o.file).join(", ")
  );
});

test("escenario «acceso»: cada apertura escribe su propia fila en AuditLog", async () => {
  await logStripeConsoleOpened({ orgId, actorUserId: null, connected: true, environment: "TEST" });
  await logStripeConsoleOpened({ orgId, actorUserId: null, connected: true, environment: "TEST" });

  const filas = await prisma.auditLog.findMany({
    where: { orgId, action: STRIPE_CONSOLE_AUDIT_ACTION },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(filas.length, 2, "dos aperturas son dos filas: el registro es append-only, no un contador");
  assert.equal(filas[0].entityType, "Organization");
  assert.equal(filas[0].entityId, orgId);
  assert.deepEqual(filas[0].metadata, { connected: true, environment: "TEST" });
});

test("escenario «acceso»: la apertura se registra TAMBIÉN sin Stripe conectado", async () => {
  await logStripeConsoleOpened({ orgId, actorUserId: null, connected: false, environment: null });
  const fila = await prisma.auditLog.findFirst({
    where: { orgId, action: STRIPE_CONSOLE_AUDIT_ACTION },
    orderBy: { createdAt: "desc" },
  });
  assert.deepEqual(fila?.metadata, { connected: false, environment: null });

  // Y en la pantalla, el registro va ANTES de decidir qué se pinta: quien abrió
  // la consola de cobros queda anotado aunque no hubiera nada que enseñarle.
  const registro = PAGE.indexOf("logStripeConsoleOpened(");
  const salidaSinStripe = PAGE.indexOf("if (!resolved.ok)");
  assert.ok(registro > -1 && salidaSinStripe > -1, "la pantalla cambió de forma: revisa este test");
  assert.ok(registro < salidaSinStripe, "la salida «sin Stripe conectado» se lleva por delante el registro de la apertura");
});

// ---------------------------------------------------------------------------
// Gateo por plan · invariante de AGENTS.md
// ---------------------------------------------------------------------------

test("gateo: /stripe declara su funcionalidad y la HEREDA a sus hijas", () => {
  assert.equal(featureForStripeConsoleRoute("/stripe"), STRIPE_CONSOLE_FEATURE);
  assert.equal(featureForStripeConsoleRoute("/stripe/payouts"), STRIPE_CONSOLE_FEATURE);
  assert.equal(featureForStripeConsoleRoute("/stripe/payouts/[id]"), STRIPE_CONSOLE_FEATURE);
  // Hereda por segmento, no por texto.
  assert.equal(featureForStripeConsoleRoute("/stripe-informes"), undefined);
});

test("gateo: una ruta nueva de la consola sin gate declarado falla AQUÍ", () => {
  const sinGate = consoleRoutes().filter(({ route }) => !featureForStripeConsoleRoute(route));
  assert.deepEqual(
    sinGate.map((o) => o.route),
    [],
    "Estas rutas de la consola no tienen funcionalidad declarada: decláralas en STRIPE_CONSOLE_FEATURE_BY_ROUTE " +
      "(o en FEATURE_BY_ROUTE cuando rbac.ts deje de estar congelado)"
  );
});

test("gateo: la funcionalidad existe en el catálogo y se vende en algún plan", () => {
  assert.ok(
    PLATFORM_PLANS.some((plan) => plan.features.includes(STRIPE_CONSOLE_FEATURE)),
    "un gate que ningún plan incluye deja la consola cerrada para todo el mundo"
  );
});

test("gateo: el día que rbac.ts declare /stripe, las dos declaraciones dicen lo mismo", () => {
  // `rbac.ts` está congelado este trimestre, así que el mapa vive en
  // `stripe-console.ts`. Cuando la línea se mueva a `FEATURE_BY_ROUTE`, este
  // test se asegura de que no acaben conviviendo dos gates distintos.
  const enRbac = FEATURE_BY_ROUTE[STRIPE_CONSOLE_ROUTE];
  if (enRbac !== undefined) assert.equal(enRbac, STRIPE_CONSOLE_FEATURE);
});

// ---------------------------------------------------------------------------
// Escenario 2 · Entorno: distintivo TEST o LIVE según el prefijo de la clave
// ---------------------------------------------------------------------------

test("escenario «entorno»: LIVE con clave de producción, TEST con la de pruebas", () => {
  assert.equal(stripeEnvironment(true), "LIVE");
  assert.equal(stripeEnvironment(false), "TEST");
});

test("escenario «entorno»: el prefijo se mira en un solo sitio del sistema", () => {
  // `livemode` lo resuelve `stripeReadClient()` (S1, `billing-shared.ts`). Si
  // la consola volviera a leer la variable de entorno por su cuenta, tendríamos
  // dos maneras de decidir lo mismo — y un día dirían cosas distintas.
  assert.equal(/STRIPE_SECRET_KEY/.test(LIB), false, "la consola no vuelve a mirar la clave: la mira stripeReadClient()");
  assert.match(LIB, /stripeReadClient\(orgId\)/);
});

test("escenario «entorno»: la pantalla pinta el distintivo con lo que resuelve el cliente", () => {
  assert.match(PAGE, /stripeEnvironment\(resolved\.source\.livemode\)/);
  assert.match(PAGE, /LIVE/);
  assert.match(PAGE, /TEST/);
});

// ---------------------------------------------------------------------------
// Escenario 3 · Listados con paginación POR CURSOR
// ---------------------------------------------------------------------------

test("escenario «listados»: están los cuatro que pide la historia", () => {
  assert.deepEqual([...STRIPE_CONSOLE_LIST_IDS], ["charges", "subscriptions", "customers", "payouts"]);
});

test("escenario «listados»: el cursor es el id del último objeto, y solo si hay más", () => {
  assert.equal(nextCursorFor({ rows: [row("ch_1"), row("ch_2")], hasMore: true }), "ch_2");
  assert.equal(nextCursorFor({ rows: [row("ch_1"), row("ch_2")], hasMore: false }), null);
  // Página vacía que dice tener más: no hay id del que seguir, así que no hay
  // cursor que ofrecer — mejor sin enlace que con un enlace que no avanza.
  assert.equal(nextCursorFor({ rows: [], hasMore: true }), null);
});

test("escenario «listados»: se pide a Stripe con starting_after, nunca con un offset", () => {
  const llamadas: { id: StripeConsoleListId; startingAfter?: string }[] = [];
  const source = fakeSource(
    { charges: { rows: [row("ch_9")], hasMore: true } },
    { onCall: (id, params) => llamadas.push({ id, startingAfter: params.startingAfter }) }
  );

  return loadStripeConsoleCards(source, { charges: "ch_8" }).then(() => {
    assert.equal(llamadas.find((c) => c.id === "charges")?.startingAfter, "ch_8");
    // Las otras tres arrancan por el principio: el cursor es de cada tarjeta.
    assert.equal(llamadas.find((c) => c.id === "payouts")?.startingAfter, undefined);
    assert.match(LIB, /starting_after: startingAfter/);
    assert.equal(/\boffset\b/.test(LIB), false, "la API de Stripe es de cursor: un offset sería inventarse una página");
  });
});

test("escenario «listados»: el límite es explícito y acotado", async () => {
  const limites: number[] = [];
  const source = fakeSource({}, { onCall: (_id, params) => limites.push(params.limit) });
  await loadStripeConsoleCards(source);
  assert.deepEqual(limites, Array(4).fill(STRIPE_CONSOLE_PAGE_SIZE));
  assert.ok(STRIPE_CONSOLE_PAGE_SIZE > 0 && STRIPE_CONSOLE_PAGE_SIZE <= 100, "Stripe no sirve más de 100 por página");
});

test("escenario «listados»: avanzar una tarjeta no devuelve las otras a su primera página", () => {
  const cursores = { charges: "ch_8", payouts: "po_3" };
  const href = stripeConsoleHref(cursores, "charges", "ch_9");
  const query = new URLSearchParams(href.split("?")[1]);
  assert.equal(query.get("charges"), "ch_9");
  assert.equal(query.get("payouts"), "po_3");

  // "Volver al principio" quita SOLO el cursor de esa tarjeta.
  const vuelta = new URLSearchParams(stripeConsoleHref(cursores, "charges", null).split("?")[1]);
  assert.equal(vuelta.get("charges"), null);
  assert.equal(vuelta.get("payouts"), "po_3");

  assert.equal(stripeConsoleHref({}, "charges", null), STRIPE_CONSOLE_ROUTE);
});

test("escenario «listados»: de la query solo se leen los cuatro cursores conocidos", () => {
  assert.deepEqual(parseStripeConsoleCursors({ charges: "ch_1", payouts: ["po_1", "po_2"], pepe: "x", customers: "  " }), {
    charges: "ch_1",
    payouts: "po_1",
  });
});

test("escenario «listados»: los objetos de Stripe se leen por donde la API los da hoy", () => {
  const cobro = chargeToRow({
    id: "ch_1",
    amount: 4900,
    currency: "eur",
    status: "succeeded",
    created: 1_700_000_000,
    refunded: false,
    description: "Bono 10",
    billing_details: { name: "Amaia Roiz" },
  } as unknown as Stripe.Charge);
  assert.equal(cobro.title, "Amaia Roiz");
  assert.equal(cobro.amountCents, 4900);
  assert.deepEqual(cobro.at, new Date(1_700_000_000_000));

  // Un cargo devuelto sigue siendo "succeeded" en Stripe: la fila lo dice.
  const devuelto = chargeToRow({
    id: "ch_2",
    amount: 4900,
    currency: "eur",
    status: "succeeded",
    created: 1_700_000_000,
    refunded: true,
    description: null,
    billing_details: {},
  } as unknown as Stripe.Charge);
  assert.equal(devuelto.subtitle, "Devuelto");

  // El periodo de una suscripción vive en el ITEM desde la API 2025-03-31:
  // leerlo de `Subscription.current_period_end` devuelve `undefined` sin avisar.
  const suscripcion = subscriptionToRow({
    id: "sub_1",
    status: "active",
    currency: "eur",
    customer: "cus_1",
    items: { data: [{ current_period_end: 1_700_000_000, price: { unit_amount: 5900, currency: "eur" } }] },
  } as unknown as Stripe.Subscription);
  assert.equal(suscripcion.status, "active");
  assert.equal(suscripcion.amountCents, 5900);
  assert.deepEqual(suscripcion.at, new Date(1_700_000_000_000));

  const cliente = customerToRow({ id: "cus_1", name: "Rubén Setién", email: "ruben@example.com", created: 1_700_000_000 } as Stripe.Customer);
  assert.equal(cliente.title, "Rubén Setién");
  assert.equal(cliente.subtitle, "ruben@example.com");

  const payout = payoutToRow({
    id: "po_1",
    amount: 120_000,
    currency: "eur",
    status: "in_transit",
    arrival_date: 1_700_086_400,
    failure_message: null,
  } as unknown as Stripe.Payout);
  assert.equal(payout.status, "in_transit");
  assert.deepEqual(payout.at, new Date(1_700_086_400_000), "arrival_date es el dato: cuándo entra el dinero");
});

// ---------------------------------------------------------------------------
// Escenario 4 · Error de Stripe: la tarjeta degrada, la pantalla sigue en pie
// ---------------------------------------------------------------------------

test("escenario «error de Stripe»: la tarjeta afectada degrada con SU mensaje", async () => {
  const source = fakeSource({
    charges: new Error("Invalid API Key provided: rk_test_***"),
    subscriptions: { rows: [row("sub_1")], hasMore: false },
    customers: { rows: [row("cus_1")], hasMore: true },
    payouts: { rows: [row("po_1")], hasMore: false },
  });

  const cards = await loadStripeConsoleCards(source);
  const cobros = cards.find((c) => c.id === "charges");
  assert.equal(cobros?.status, "error");
  assert.equal(cobros?.status === "error" && cobros.message, "Invalid API Key provided: rk_test_***");

  // Y las otras tres siguen en pie, con sus datos y su paginación.
  for (const id of ["subscriptions", "customers", "payouts"] as const) {
    const card = cards.find((c) => c.id === id);
    assert.equal(card?.status, "ok", `${id} se cayó con la tarjeta de cobros`);
  }
  const clientes = cards.find((c) => c.id === "customers");
  assert.equal(clientes?.status === "ok" && clientes.nextCursor, "cus_1");
});

test("escenario «error de Stripe»: cuatro listados caídos siguen siendo cuatro tarjetas, no una excepción", async () => {
  const source = fakeSource({
    charges: new Error("rate limit"),
    subscriptions: new Error("rate limit"),
    customers: new Error("rate limit"),
    payouts: new Error("rate limit"),
  });

  const cards = await loadStripeConsoleCards(source);
  assert.equal(cards.length, 4);
  assert.ok(cards.every((c) => c.status === "error"));
});

test("escenario «error de Stripe»: lo que se lanza sin mensaje también se cuenta", () => {
  assert.equal(stripeConsoleErrorMessage("payouts", { message: "  Connection error.  " }), "Connection error.");
  assert.equal(stripeConsoleErrorMessage("payouts", "vaya"), "Stripe no pudo devolver transferencias al banco.");
  assert.equal(stripeConsoleErrorMessage("charges", null), "Stripe no pudo devolver cobros.");
});

test("escenario «error de Stripe»: la pantalla pinta el mensaje de la tarjeta, no un error global", () => {
  const card = readFileSync(join(CONSOLE_DIR, "stripe-list-card.tsx"), "utf8");
  assert.match(card, /card\.message/);
  // Ninguna pantalla de la consola lanza por su cuenta: `notFound`/`throw`
  // dentro del render es exactamente lo que tumbaría las otras tres tarjetas.
  for (const { file } of consoleRoutes()) {
    assert.equal(/\bthrow\b/.test(readFileSync(file, "utf8")), false, `${file} lanza dentro del render`);
  }
});

// ---------------------------------------------------------------------------
// Sin Stripe conectado · la sección lo explica, sin botón muerto
// ---------------------------------------------------------------------------

test("sin Stripe conectado: se explica que hace falta conectar cobros, con un enlace que lleva a hacerlo", () => {
  assert.match(PAGE, /EmptyState/);
  assert.match(PAGE, /Conectar cobros/);
  // El enlace va a donde de verdad se conecta la cuenta (`/organization`, que
  // es quien pinta `StripeConnectCard`): un botón que no lleva a ningún sitio
  // es lo que la historia prohíbe.
  assert.match(PAGE, /href="\/organization"/);
  assert.match(readFileSync(join("src", "app", "(app)", "organization", "page.tsx"), "utf8"), /StripeConnectCard/);
});

test("solo lectura: la consola no escribe en Stripe ni en la base de datos, salvo el registro de auditoría", () => {
  for (const escritura of [/stripe\.[a-zA-Z.]+\.(create|update|del|cancel)\(/, /prisma\.(?!auditLog)[a-zA-Z]+\.(create|update|upsert|delete)/]) {
    assert.equal(escritura.test(LIB), false, `stripe-console.ts escribe: ${escritura}`);
  }
  for (const { file } of consoleRoutes()) {
    assert.equal(/prisma\./.test(readFileSync(file, "utf8")), false, `${file} habla con la base de datos por su cuenta`);
  }
});

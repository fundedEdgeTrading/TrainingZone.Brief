import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_BY_ROUTE, NAV_BY_ROLE, featureForRoute, filterNavByFeatures, withFeatureFlags } from "@/lib/rbac";
import { getPlatformPlan, type PlatformFeature } from "@/lib/platform-plans";

/**
 * El muro de pago y quién entra a cada pantalla. Lo que se prueba aquí es lo
 * que se saltaba escribiendo la URL a mano.
 */

const APP_DIR = "src/app/(app)";

/** Rutas reales de `(app)`, con sus segmentos dinámicos tal cual (`[id]`). */
function appRoutes(dir = APP_DIR, prefix = ""): { route: string; file: string }[] {
  const found: { route: string; file: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Los grupos de rutas `(grupo)` no forman parte de la URL.
      const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
      found.push(...appRoutes(join(dir, entry.name), `${prefix}${segment}`));
    } else if (entry.name === "page.tsx") {
      found.push({ route: prefix || "/", file: join(dir, entry.name) });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// E6-02 · Herencia del gate a las rutas hijas
// ---------------------------------------------------------------------------

test("E6-02 · la ruta hija hereda la funcionalidad del padre", () => {
  assert.equal(featureForRoute("/brief"), "salud_aptitud");
  assert.equal(featureForRoute("/brief/[id]"), "salud_aptitud");
  // El enlace que pinta la propia agenda: `/brief/<sessionId>?d=…`.
  assert.equal(featureForRoute("/brief/abc123"), "salud_aptitud");
  assert.equal(featureForRoute("/feedback/[id]"), "feedback_direccion");
  assert.equal(featureForRoute("/feedback/debriefs-semanales"), "feedback_direccion");
  // Y lo que no cuelga de una ruta gateada, sigue sin gate.
  assert.equal(featureForRoute("/dashboard"), undefined);
  assert.equal(featureForRoute("/briefing-de-prensa"), undefined, "hereda por segmento, no por texto");
});

test("E6-02 · toda pantalla con gate heredado llama a la guarda", () => {
  const offenders = appRoutes()
    .filter(({ route }) => featureForRoute(route))
    .filter(({ file }) => !/requireFeature\(/.test(readFileSync(file, "utf8")));

  assert.deepEqual(
    offenders.map((o) => o.route),
    [],
    "Estas pantallas están gateadas por el mapa y no comprueban el plan, así que se abren escribiendo la URL: " +
      offenders.map((o) => o.file).join(", ")
  );
});

// ---------------------------------------------------------------------------
// Lote 3 · etiquetas, flujos y referidos entran gateados desde el primer día
// ---------------------------------------------------------------------------
// Las tres rutas se declaran ANTES de que exista ninguna de sus pantallas, que
// es justo el orden que evita el agujero de E6-02: cuando E1, E2 y R1 creen su
// `page.tsx`, el test de arriba («toda pantalla con gate heredado llama a la
// guarda») ya las está mirando y falla si no llaman a `requireFeature`. El
// gateo no se añade después de tener la pantalla; la pantalla nace dentro de él.

test("lote3 · las tres rutas nuevas están declaradas en el mapa", () => {
  assert.equal(featureForRoute("/etiquetas"), "marketing_automatizado");
  assert.equal(featureForRoute("/flujos"), "marketing_automatizado");
  assert.equal(featureForRoute("/referidos"), "marketing_automatizado");
});

test("lote3 · las hijas heredan sin necesitar entrada propia", () => {
  // El panel por flujo (E3) cuelga dos niveles por debajo y nadie va a
  // acordarse de declararlo: por eso la herencia es por prefijo.
  assert.equal(featureForRoute("/flujos/abc123/panel"), "marketing_automatizado");
  assert.equal(featureForRoute("/flujos/[id]/panel"), "marketing_automatizado");
  assert.equal(featureForRoute("/etiquetas/[id]"), "marketing_automatizado");
  assert.equal(featureForRoute("/referidos/embajadores"), "marketing_automatizado");
  // Y hereda por SEGMENTO, no por texto: `/referidos-antiguos` no es hija de
  // `/referidos`.
  assert.equal(featureForRoute("/referidos-antiguos"), undefined);
});

test("lote3 · lo que sigue abierto en la misma sección del menú", () => {
  // Se cobra la automatización, no apuntar a quien entra por la puerta:
  // el CRM de leads y los anuncios son de todos los planes (`CORE_FEATURES`).
  assert.equal(featureForRoute("/leads"), undefined);
  assert.equal(featureForRoute("/anuncios"), undefined);
});

test("lote3 · los tres items están en «Crecimiento» y con su gate resuelto", () => {
  for (const role of ["OWNER", "CENTER_DIRECTOR"] as const) {
    const crecimiento = withFeatureFlags(NAV_BY_ROLE[role]).filter((i) => i.section === "Crecimiento");
    for (const href of ["/etiquetas", "/flujos", "/referidos"]) {
      const item = crecimiento.find((i) => i.href === href);
      assert.ok(item, `${role} no tiene ${href} en Crecimiento`);
      assert.equal(item.feature, "marketing_automatizado", `${href} aparecería en el menú sin comprobar el plan`);
    }
  }
  // Recepción valida y marca como pagada la recompensa del referido; el
  // catálogo de etiquetas y el editor de flujos son configuración de dirección.
  const recepcion = NAV_BY_ROLE.RECEPTION.map((i) => i.href);
  assert.ok(recepcion.includes("/referidos"));
  assert.equal(recepcion.includes("/etiquetas"), false);
  assert.equal(recepcion.includes("/flujos"), false);
});

test("lote3 · un plan sin la funcionalidad no ve ninguno de los tres", () => {
  // Esencial: `features: []`. El menú no los pinta, y la guarda de página cierra
  // la URL escrita a mano (`requireFeature`, comprobada por el test de E6-02).
  const esencial = filterNavByFeatures(NAV_BY_ROLE.OWNER, new Set<PlatformFeature>());
  for (const href of ["/etiquetas", "/flujos", "/referidos"]) {
    assert.equal(esencial.some((i) => i.href === href), false, `${href} se cuela con plan Esencial`);
  }
  // Y con Avanzado (que la incluye) están los tres.
  const avanzado = filterNavByFeatures(NAV_BY_ROLE.OWNER, new Set<PlatformFeature>(["marketing_automatizado"]));
  for (const href of ["/etiquetas", "/flujos", "/referidos"]) {
    assert.ok(avanzado.some((i) => i.href === href), `${href} no llega con el plan que lo incluye`);
  }
});

test("lote3 · la funcionalidad la vende Avanzado y hacia arriba, no Esencial", () => {
  const featuresOf = (code: string) => getPlatformPlan(code)?.features ?? [];
  assert.equal(featuresOf("esencial_mes").includes("marketing_automatizado"), false);
  for (const code of ["avanzado_mes", "avanzado_ano", "elite_mes", "elite_ano", "fundador"]) {
    assert.ok(featuresOf(code).includes("marketing_automatizado"), `${code} debería incluirla`);
  }
});

// ---------------------------------------------------------------------------
// E6-07 · /audit sale del muro de pago, la exportación se queda dentro
// ---------------------------------------------------------------------------

test("E6-07 · la consulta del registro de accesos entra en todos los planes", () => {
  assert.equal(FEATURE_BY_ROUTE["/audit"], undefined);
  assert.equal(featureForRoute("/audit"), undefined);
  const page = readFileSync(join(APP_DIR, "audit", "page.tsx"), "utf8");
  assert.equal(/requireFeature\(/.test(page), false, "el gimnasio tiene que poder acreditar el art. 32 RGPD con su plan");
});

test("E6-07 · la exportación masiva sigue siendo de pago", () => {
  const route = readFileSync("src/app/api/audit/export/route.ts", "utf8");
  assert.match(route, /requireFeature\("exportaciones"\)/);
});

// ---------------------------------------------------------------------------
// E6-03 · ia_programacion se comprueba antes de gastar
// ---------------------------------------------------------------------------

test("E6-03 · las dos superficies rechazan ANTES de llamar al proveedor de IA", () => {
  const surfaces = [
    { file: "src/app/(app)/members/[id]/mesociclos/actions.ts", call: "generateMesocyclePlan(" },
    { file: "src/app/api/mobile/v1/trainer/members/[id]/mesocycles/route.ts", call: "generateMesocyclePlan(" },
  ];
  for (const { file, call } of surfaces) {
    const source = readFileSync(file, "utf8");
    const gate = source.indexOf('"ia_programacion"');
    const provider = source.indexOf(call);
    assert.notEqual(gate, -1, `${file} no comprueba ia_programacion`);
    assert.notEqual(provider, -1, `${file} ya no llama al generador: revisa este test`);
    assert.ok(gate < provider, `${file} llama al proveedor antes de comprobar el plan`);
  }
});

// ---------------------------------------------------------------------------
// E12-11 · /trainer accesible para dirección
// ---------------------------------------------------------------------------

test("E12-11 · dirección tiene el panel del equipo en su navegación", () => {
  for (const role of ["OWNER", "CENTER_DIRECTOR"] as const) {
    assert.ok(
      NAV_BY_ROLE[role].some((item) => item.href === "/trainer"),
      `${role} debería poder ver el panel de su equipo`
    );
  }
});

test("E12-11 · la pantalla deja entrar a dirección y el entrenador sigue viendo el suyo", () => {
  const page = readFileSync(join(APP_DIR, "trainer", "page.tsx"), "utf8");
  const roles = page.match(/requireRole\(\[([^\]]+)\]\)/);
  assert.ok(roles, "la pantalla sigue exigiendo rol");
  for (const role of ["TRAINER", "TRAINER_ADMIN", "OWNER", "CENTER_DIRECTOR"]) {
    assert.match(roles[1], new RegExp(`"${role}"`), `falta ${role}`);
  }
  // El panel se calcula para el entrenador mirado, con el rol de quien mira:
  // así el ámbito de salud sigue siendo el de dirección, no el del entrenador.
  assert.match(page, /getTrainerPanelData\(session\.user\.orgId, subject\.id, session\.user\.role/);
});

test("E12-11 · el panel del socio no se toca", () => {
  assert.equal(
    NAV_BY_ROLE.MEMBER.some((item) => item.href === "/trainer"),
    false
  );
});

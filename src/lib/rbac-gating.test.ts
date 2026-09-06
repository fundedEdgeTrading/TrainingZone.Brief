import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_BY_ROUTE, featureForRoute } from "@/lib/rbac";

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


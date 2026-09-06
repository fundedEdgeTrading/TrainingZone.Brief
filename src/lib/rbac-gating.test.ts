import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { featureForRoute } from "@/lib/rbac";

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


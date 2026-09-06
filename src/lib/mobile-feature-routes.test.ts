import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MOBILE_FEATURE_BY_ROUTE,
  featureForMobileRoute,
  isMobileRouteDeclared,
  normalizeMobileRoute,
} from "@/lib/mobile-feature-routes";

const MOBILE_API_DIR = "src/app/api/mobile/v1";

/** Rutas reales del sistema de ficheros, sin el prefijo de la API. */
function mobileRoutes(dir = MOBILE_API_DIR, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue; // `_lib`: no son rutas
      found.push(...mobileRoutes(join(dir, entry.name), `${prefix}/${entry.name}`));
    } else if (entry.name === "route.ts") {
      found.push(prefix);
    }
  }
  return found;
}

test("E6-01 · el gate de la ruta padre se hereda en las hijas", () => {
  assert.equal(featureForMobileRoute("/trainer/brief"), "salud_aptitud");
  assert.equal(featureForMobileRoute("/trainer/brief/[id]"), "salud_aptitud");
  assert.equal(featureForMobileRoute("/trainer/brief/[id]/debrief"), "salud_aptitud");
  // El enlace que pinta la propia app tampoco elude el gate.
  assert.equal(featureForMobileRoute("/api/mobile/v1/trainer/brief/abc123"), "salud_aptitud");
});

test("E6-03 · la declaración más específica gana a la del padre", () => {
  // `/trainer/members` es salud; generar mesociclos con IA cuesta dinero de
  // verdad y va por su propia funcionalidad.
  assert.equal(featureForMobileRoute("/trainer/members"), "salud_aptitud");
  assert.equal(featureForMobileRoute("/trainer/members/[id]"), "salud_aptitud");
  assert.equal(featureForMobileRoute("/trainer/members/[id]/mesocycles"), "ia_programacion");
});

test("E6-01 · una ruta nueva sin gate declarado falla en el test, no en producción", () => {
  const undeclared = mobileRoutes().filter((route) => !isMobileRouteDeclared(route));
  assert.deepEqual(
    undeclared,
    [],
    `Rutas de la API móvil sin declarar en mobile-feature-routes.ts: ${undeclared.join(", ")}. ` +
      "Declara su funcionalidad en MOBILE_FEATURE_BY_ROUTE, o su ausencia de gate en MOBILE_ROUTES_WITHOUT_FEATURE."
  );
});

test("el mapa no declara rutas que ya no existen", () => {
  const real = mobileRoutes();
  for (const key of Object.keys(MOBILE_FEATURE_BY_ROUTE)) {
    assert.ok(
      real.some((route) => route === key || route.startsWith(`${key}/`)),
      `${key} está gateada y no existe ninguna ruta debajo`
    );
  }
});

test("lo que no se gatea, no se gatea", () => {
  // Registrar y consultar lo que el gimnasio ya guardó NUNCA se gatea
  // (RB-PLAN-003): la ficha del socio, su agenda y su portal entran en todos
  // los planes.
  assert.equal(featureForMobileRoute("/members/[id]"), undefined);
  assert.equal(featureForMobileRoute("/portal/agenda"), undefined);
  assert.equal(featureForMobileRoute("/auth/login"), undefined);
  assert.equal(featureForMobileRoute("/trainer/panel"), undefined);
});

test("normalizar una ruta quita el prefijo y la barra final", () => {
  assert.equal(normalizeMobileRoute("/api/mobile/v1/trainer/brief/"), "/trainer/brief");
  assert.equal(normalizeMobileRoute("trainer/brief"), "/trainer/brief");
});

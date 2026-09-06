import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E8-16 · el panel de acceso demo y los botones de SSO muertos salen del
 * login. No se puede montar el componente de cliente en este harness
 * (`test:unit` solo ejecuta `.test.ts`), así que se comprueba por código
 * fuente: es exactamente lo que hace el resto de tests de "no vuelva a
 * aparecer X" de este repositorio (p. ej. service-labels.test.ts).
 */

const SOURCE = readFileSync(join("src", "app", "login", "login-form.tsx"), "utf8");

test("E8-16 · no quedan botones de SSO permanentemente disabled con la explicación en un title", () => {
  assert.doesNotMatch(SOURCE, /Continuar con Microsoft/);
  assert.doesNotMatch(SOURCE, /Continuar con Google/);
});

test("E8-16 · el panel de usuarios demo está gateado por la bandera de modo demo", () => {
  assert.match(SOURCE, /demoModeActive\s*&&/);
  // La lista de usuarios demo tiene que vivir DENTRO de ese gate, no antes.
  const gateIndex = SOURCE.indexOf("demoModeActive &&");
  const usersIndex = SOURCE.indexOf("DEMO_USERS.map");
  assert.ok(gateIndex > -1 && usersIndex > gateIndex, "DEMO_USERS.map debe aparecer después del gate demoModeActive &&");
});

test("E8-16 · la página de login resuelve la bandera con isDemoModeActive, la misma del resto del modo demo", () => {
  const page = readFileSync(join("src", "app", "login", "page.tsx"), "utf8");
  assert.match(page, /isDemoModeActive/);
});

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
  const gateIndex = SOURCE.indexOf("demoModeActive && demoAccess &&");
  const usersIndex = SOURCE.indexOf("demoAccess.users.map");
  assert.ok(gateIndex > -1 && usersIndex > gateIndex, "demoAccess.users.map debe aparecer después del gate demoModeActive &&");
});

test("E8-16 · la página de login resuelve la bandera con isDemoModeActive, la misma del resto del modo demo", () => {
  const page = readFileSync(join("src", "app", "login", "page.tsx"), "utf8");
  assert.match(page, /isDemoModeActive/);
});

/**
 * PROD-01 · el panel no se pintaba en producción, pero los usuarios sembrados y
 * la contraseña compartida eran constantes del componente de CLIENTE: viajaban
 * en el JS público de cualquier entorno. Ahora son datos del servidor y solo
 * cruzan al cliente con el modo demo encendido.
 */
test("PROD-01 · el componente de cliente no lleva credenciales demo en su código", () => {
  assert.doesNotMatch(SOURCE, /demo1234/);
  assert.doesNotMatch(SOURCE, /email: "[^"]+@/);
  assert.doesNotMatch(SOURCE, /DEMO_USERS|DEMO_PASSWORD/);
});

test("PROD-01 · con el modo demo apagado, al cliente no llega nada", async () => {
  const { demoAccessForLogin } = await import("./demo-users");
  assert.equal(demoAccessForLogin(false), null);
  const on = demoAccessForLogin(true);
  assert.ok(on && on.users.length > 0 && on.password.length > 0);
});

test("PROD-01 · la página se renderiza por petición: DEMO_MODE no se congela en el build", () => {
  const page = readFileSync(join("src", "app", "login", "page.tsx"), "utf8");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /demoAccessForLogin\(isDemoModeActive\(\)\)/);
});

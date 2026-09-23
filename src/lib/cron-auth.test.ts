import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { authorizeCronRequest, checkCronSecret } from "./cron-auth";

/**
 * PROD-04 · los disparadores de cron solo aceptan el secreto por cabecera, en
 * tiempo constante, y fallan cerrados sin secreto configurado.
 */

const SECRET = "cron-secreto-de-prueba";

test("PROD-04 · sin secreto configurado, falla cerrado (unconfigured → 503)", () => {
  assert.equal(checkCronSecret(SECRET, undefined), "unconfigured");
  assert.equal(checkCronSecret(SECRET, ""), "unconfigured");
  assert.equal(checkCronSecret(null, ""), "unconfigured");
});

test("PROD-04 · secreto correcto, incorrecto, ausente y de otra longitud", () => {
  assert.equal(checkCronSecret(SECRET, SECRET), "ok");
  assert.equal(checkCronSecret("otro", SECRET), "unauthorized");
  assert.equal(checkCronSecret(`${SECRET}x`, SECRET), "unauthorized");
  assert.equal(checkCronSecret(SECRET.slice(0, -1), SECRET), "unauthorized");
  assert.equal(checkCronSecret("", SECRET), "unauthorized");
  assert.equal(checkCronSecret(null, SECRET), "unauthorized");
});

test("PROD-04 · solo cuenta la cabecera x-cron-secret", () => {
  assert.equal(authorizeCronRequest(new Headers({ "x-cron-secret": SECRET }), SECRET), "ok");
  assert.equal(authorizeCronRequest(new Headers(), SECRET), "unauthorized");
});

/**
 * La mitad que se rompió de verdad: los dos endpoints leían también
 * `?secret=`. Se comprueba por código fuente porque importarlos arrastra
 * Prisma y, con un secreto válido, ejecutaría todas las reglas.
 */
for (const route of [
  join("src", "app", "api", "jobs", "run", "route.ts"),
  join("src", "app", "api", "flujos", "cron", "route.ts"),
]) {
  test(`PROD-04 · ${route} no acepta el secreto por query string y usa el helper compartido`, () => {
    const source = readFileSync(route, "utf8");
    assert.doesNotMatch(source, /searchParams\.get\(\s*["']secret["']\s*\)/);
    assert.match(source, /authorizeCronRequest\(/);
    assert.match(source, /status: 503/, "sin secreto configurado sigue respondiendo 503");
  });
}

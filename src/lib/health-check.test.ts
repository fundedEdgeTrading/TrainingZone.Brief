import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkHealth } from "./health-check";
import { isPublicPath } from "./public-paths";

/**
 * PROD-06 · `/api/health` para Render y el monitor de disponibilidad. El
 * contrato {ok, db} es fijo: P11 lo configura como healthCheckPath.
 */

test("PROD-06 · base de datos que responde → 200 {ok:true, db:'up'}", async () => {
  const result = await checkHealth(async () => [{ "?column?": 1 }]);
  assert.deepEqual(result, { status: 200, body: { ok: true, db: "up" } });
});

test("PROD-06 · base de datos que falla → 503 {ok:false, db:'down'} sin el mensaje de error", async () => {
  const result = await checkHealth(async () => {
    throw new Error("password authentication failed for user apta_app at db.internal:5432");
  });
  assert.deepEqual(result, { status: 503, body: { ok: false, db: "down" } });
  assert.doesNotMatch(JSON.stringify(result), /password|apta_app|5432/);
});

test("PROD-06 · base de datos que no contesta → 503 al cumplirse el timeout", async () => {
  const started = Date.now();
  const result = await checkHealth(() => new Promise(() => {}), 50);
  assert.deepEqual(result, { status: 503, body: { ok: false, db: "down" } });
  assert.ok(Date.now() - started < 1_000, "no puede esperar al driver");
});

test("PROD-06 · /api/health es pública: el proxy no la rebota a /login", () => {
  assert.equal(isPublicPath("/api/health"), true);
});

test("PROD-06 · la ruta es dinámica, sin caché, y usa SELECT 1 con el helper", () => {
  const source = readFileSync(join("src", "app", "api", "health", "route.ts"), "utf8");
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /no-store/);
  assert.match(source, /SELECT 1/);
  assert.match(source, /checkHealth\(/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assertProductionEnv, checkProductionEnv } from "./env-check";

/**
 * PROD-02 · el servidor no arranca en producción con la configuración a
 * medias. Antes cada ausencia degradaba en silencio (demo encendida, correo
 * simulado, jobs sin correr, fotos en disco efímero).
 */

const GOOD = {
  NODE_ENV: "production",
  AUTH_SECRET: "un-secreto-largo-de-verdad-0123456789abcdef",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_y",
  STRIPE_CONNECT_CLIENT_ID: "ca_x",
  BREVO_API_KEY: "xkeysib-x",
  BREVO_FROM_EMAIL: "no-reply@apta.example",
  PROGRESS_PHOTO_KEY: Buffer.alloc(32, 7).toString("base64"),
  PROGRESS_PHOTO_DIR: "/var/data/progress-photos",
  JOBS_CRON_SECRET: "cron-secreto",
  NEXT_PUBLIC_SITE_URL: "https://apta.example",
};

const names = (env: Record<string, string | undefined>) => checkProductionEnv(env).map((p) => p.name);

test("PROD-02 · una configuración completa no da problemas", () => {
  assert.deepEqual(checkProductionEnv(GOOD), []);
});

test("PROD-02 · cada variable obligatoria que falta aparece por su nombre", () => {
  for (const name of Object.keys(GOOD).filter((k) => k !== "NODE_ENV")) {
    assert.deepEqual(names({ ...GOOD, [name]: undefined }), [name], name);
    assert.deepEqual(names({ ...GOOD, [name]: "   " }), [name], `${name} solo con espacios`);
  }
});

test("PROD-02 · AUTH_SECRET débil: el del ejemplo o menos de 32 caracteres", () => {
  assert.deepEqual(names({ ...GOOD, AUTH_SECRET: "change-me-in-production" }), ["AUTH_SECRET"]);
  assert.deepEqual(names({ ...GOOD, AUTH_SECRET: "x".repeat(31) }), ["AUTH_SECRET"]);
  assert.deepEqual(names({ ...GOOD, AUTH_SECRET: "x".repeat(32) }), []);
});

test("PROD-02 · PROGRESS_PHOTO_KEY publicada en el repo o de longitud incorrecta", () => {
  assert.deepEqual(names({ ...GOOD, PROGRESS_PHOTO_KEY: "ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZCE=" }), ["PROGRESS_PHOTO_KEY"]);
  assert.deepEqual(names({ ...GOOD, PROGRESS_PHOTO_KEY: Buffer.alloc(16).toString("base64") }), ["PROGRESS_PHOTO_KEY"]);
});

test("PROD-02 · NEXT_PUBLIC_SITE_URL tiene que ser https", () => {
  assert.deepEqual(names({ ...GOOD, NEXT_PUBLIC_SITE_URL: "http://apta.example" }), ["NEXT_PUBLIC_SITE_URL"]);
  assert.deepEqual(names({ ...GOOD, NEXT_PUBLIC_SITE_URL: "apta.example" }), ["NEXT_PUBLIC_SITE_URL"]);
});

test("PROD-02 · los mensajes nunca contienen el valor de un secreto", () => {
  const weak = { ...GOOD, AUTH_SECRET: "corto-y-secreto", PROGRESS_PHOTO_KEY: "c2VjcmV0by1jb3J0bw==" };
  const text = JSON.stringify(checkProductionEnv(weak));
  assert.doesNotMatch(text, /corto-y-secreto/);
  assert.doesNotMatch(text, /c2VjcmV0by1jb3J0bw==/);
  assert.throws(() => assertProductionEnv(weak), (err: Error) => !err.message.includes("corto-y-secreto"));
});

test("PROD-02 · demo explícita en producción: Stripe, Brevo y dominio dejan de ser obligatorios; el resto no", () => {
  const demo = {
    NODE_ENV: "production",
    DEMO_MODE: "true",
    ALLOW_DEMO_IN_PRODUCTION: "true",
    AUTH_SECRET: GOOD.AUTH_SECRET,
    PROGRESS_PHOTO_KEY: GOOD.PROGRESS_PHOTO_KEY,
    PROGRESS_PHOTO_DIR: GOOD.PROGRESS_PHOTO_DIR,
    JOBS_CRON_SECRET: GOOD.JOBS_CRON_SECRET,
  };
  assert.deepEqual(checkProductionEnv(demo), []);
  assert.deepEqual(names({ ...demo, JOBS_CRON_SECRET: undefined }), ["JOBS_CRON_SECRET"]);
  // DEMO_MODE solo (sin ALLOW_DEMO_IN_PRODUCTION) no es demo en producción.
  assert.ok(names({ ...demo, ALLOW_DEMO_IN_PRODUCTION: undefined }).includes("STRIPE_SECRET_KEY"));
});

test("PROD-02 · solo aborta en producción y fuera del build", () => {
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: "development" }));
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }));
  assert.throws(() => assertProductionEnv({ NODE_ENV: "production" }), /PROD-02/);
  assert.doesNotThrow(() => assertProductionEnv(GOOD));
});

test("PROD-02 · instrumentation.ts lo ejecuta en el arranque, después de E10-07 y sin tocar su log", () => {
  const source = readFileSync(join("src", "instrumentation.ts"), "utf8");
  const region = source.indexOf("assertEuDataRegion()");
  const env = source.indexOf("assertProductionEnv(");
  assert.ok(region > -1 && env > region, "assertProductionEnv tiene que llamarse tras la comprobación de región");
  assert.match(source, /\[E10-07\] Región de datos verificada: \$\{region\.label\} \(\$\{region\.country\}\)\./);
});

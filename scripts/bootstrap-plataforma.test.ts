import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEMO_ORG_SLUG,
  demoDataError,
  environmentError,
  parseArgs,
  planBootstrap,
  readConfig,
  type ExistingState,
} from "./bootstrap-plataforma";

const NOW = new Date("2026-10-06T10:00:00Z");
const EMPTY: ExistingState = { org: null, user: null, identityHasPassword: false, invitation: null };
const PLATFORM_ORG = { platformStatus: "ACTIVE" as const, members: 0, centers: 0, payments: 0, hasPlatformCustomer: false };

test("fuera de producción se niega sin --force", () => {
  assert.match(environmentError("development", false) ?? "", /--force/);
  assert.match(environmentError(undefined, false) ?? "", /--force/);
  assert.equal(environmentError("development", true), null);
  assert.equal(environmentError("production", false), null);
});

test("parseArgs reconoce --force y --reenviar", () => {
  assert.deepEqual(parseArgs(["--force"]), { force: true, resend: false });
  assert.deepEqual(parseArgs(["--reenviar"]), { force: false, resend: true });
  assert.deepEqual(parseArgs([]), { force: false, resend: false });
});

test("readConfig exige slug y email, y normaliza el email", () => {
  const ok = readConfig({ PLATFORM_ORG_SLUG: "apta", PLATFORM_ADMIN_EMAIL: " Ops@Apta.ES " });
  assert.ok(ok.ok);
  assert.equal(ok.config.adminEmail, "ops@apta.es");
  assert.equal(ok.config.adminName, "ops");

  const missing = readConfig({});
  assert.ok(!missing.ok);
  assert.equal(missing.errors.length, 2);

  const bad = readConfig({ PLATFORM_ORG_SLUG: "Apta Plataforma", PLATFORM_ADMIN_EMAIL: "no-es-email" });
  assert.ok(!bad.ok);
  assert.equal(bad.errors.length, 2);
});

test("readConfig no acepta el slug de la organización de demo", () => {
  const r = readConfig({ PLATFORM_ORG_SLUG: DEMO_ORG_SLUG, PLATFORM_ADMIN_EMAIL: "ops@apta.es" });
  assert.ok(!r.ok);
  assert.match(r.errors[0], /demostración/);
});

test("con datos de demo se niega, sea cual sea la señal", () => {
  assert.equal(demoDataError({ demoOrg: false, demoAccounts: [] }), null);
  assert.match(demoDataError({ demoOrg: true, demoAccounts: [] }) ?? "", /demostración/);
  assert.match(demoDataError({ demoOrg: false, demoAccounts: ["socio@trainingzone.es"] }) ?? "", /socio@/);
});

test("base vacía: crea organización, administrador e invitación, y la envía", () => {
  assert.deepEqual(planBootstrap(EMPTY, { resend: false, now: NOW }), {
    createOrg: true,
    activateOrg: false,
    createUser: true,
    invitation: "create",
    sendEmail: true,
  });
});

test("segunda ejecución con invitación vigente: no crea ni envía nada", () => {
  const state: ExistingState = {
    org: PLATFORM_ORG,
    user: { role: "PLATFORM_ADMIN", deactivated: false },
    identityHasPassword: false,
    invitation: { used: false, expiresAt: new Date("2026-10-10T00:00:00Z") },
  };
  assert.deepEqual(planBootstrap(state, { resend: false, now: NOW }), {
    createOrg: false,
    activateOrg: false,
    createUser: false,
    invitation: "keep",
    sendEmail: false,
  });
  // --reenviar manda la misma invitación, sin crear otra.
  const resend = planBootstrap(state, { resend: true, now: NOW });
  assert.ok(!("refuse" in resend));
  assert.equal(resend.invitation, "keep");
  assert.equal(resend.sendEmail, true);
});

test("invitación caducada: se renueva la misma fila y se envía", () => {
  const plan = planBootstrap(
    {
      org: PLATFORM_ORG,
      user: { role: "PLATFORM_ADMIN", deactivated: false },
      identityHasPassword: false,
      invitation: { used: false, expiresAt: new Date("2026-10-01T00:00:00Z") },
    },
    { resend: false, now: NOW },
  );
  assert.ok(!("refuse" in plan));
  assert.equal(plan.invitation, "renew");
  assert.equal(plan.sendEmail, true);
});

test("quien ya tiene contraseña en Apta no recibe invitación", () => {
  const plan = planBootstrap({ ...EMPTY, identityHasPassword: true }, { resend: true, now: NOW });
  assert.ok(!("refuse" in plan));
  assert.equal(plan.createUser, true);
  assert.equal(plan.invitation, "none");
  assert.equal(plan.sendEmail, false);
});

test("una organización de plataforma no ACTIVE se activa (la purga de impagos la borraría)", () => {
  const plan = planBootstrap({ ...EMPTY, org: { ...PLATFORM_ORG, platformStatus: "PENDING_PAYMENT" } }, { resend: false, now: NOW });
  assert.ok(!("refuse" in plan));
  assert.equal(plan.activateOrg, true);
  assert.equal(plan.createOrg, false);
});

test("se niega si el slug ya es de un gimnasio con datos", () => {
  for (const org of [
    { ...PLATFORM_ORG, members: 1 },
    { ...PLATFORM_ORG, centers: 2 },
    { ...PLATFORM_ORG, payments: 1 },
    { ...PLATFORM_ORG, hasPlatformCustomer: true },
  ]) {
    assert.ok("refuse" in planBootstrap({ ...EMPTY, org }, { resend: false, now: NOW }));
  }
});

test("no cambia en silencio el rol de un usuario existente ni reactiva una baja", () => {
  const owner = planBootstrap({ ...EMPTY, org: PLATFORM_ORG, user: { role: "OWNER", deactivated: false } }, { resend: false, now: NOW });
  assert.ok("refuse" in owner);
  const gone = planBootstrap(
    { ...EMPTY, org: PLATFORM_ORG, user: { role: "PLATFORM_ADMIN", deactivated: true } },
    { resend: false, now: NOW },
  );
  assert.ok("refuse" in gone);
});

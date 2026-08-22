import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { canSendMemberEmail, type MemberEmailPreferences } from "./email-preferences";
import { generateEmailPreferencesToken, verifyEmailPreferencesToken } from "./email-verification";

const ALL_ON: MemberEmailPreferences = {
  notifyVacancies: true,
  notifyBirthday: true,
  notifyAssessments: true,
  consentMarketing: true,
  emailOptOutAt: null,
};

test("la baja global gana a cualquier interruptor que quedara encendido", () => {
  const optedOut = { ...ALL_ON, emailOptOutAt: new Date("2026-08-01") };
  for (const kind of ["vacancy", "birthday", "assessment", "marketing"] as const) {
    assert.equal(canSendMemberEmail(kind, optedOut), false, kind);
  }
});

test("cada interruptor solo apaga lo suyo", () => {
  const sinPlazas = { ...ALL_ON, notifyVacancies: false };
  assert.equal(canSendMemberEmail("vacancy", sinPlazas), false);
  assert.equal(canSendMemberEmail("birthday", sinPlazas), true);
  assert.equal(canSendMemberEmail("assessment", sinPlazas), true);
});

test("el marketing va por consentimiento, no por defecto", () => {
  assert.equal(canSendMemberEmail("marketing", { ...ALL_ON, consentMarketing: false }), false);
});

/**
 * El token del pie dura un año y solo sirve para preferencias: si valiera como
 * token de otro propósito, un correo antiguo abriría puertas que no le tocan.
 */
test("el token de preferencias identifica al socio y no vale para otra cosa", () => {
  const token = generateEmailPreferencesToken("member-1");
  assert.deepEqual(verifyEmailPreferencesToken(token), { ok: true, memberId: "member-1" });

  const [payload, mac] = token.split(".");
  const otro = generateEmailPreferencesToken("member-2").split(".")[1];
  assert.notEqual(mac, otro);
  assert.deepEqual(verifyEmailPreferencesToken(`${payload}.${otro}`), { ok: false, error: "invalid" });
});

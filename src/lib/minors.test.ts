import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  ADULT_AGE,
  ageOn,
  agePolicyLabel,
  canCaptureLeadHealthData,
  evaluateAgeAdmission,
  hasVerifiableGuardianConsent,
  LOPDGDD_CONSENT_AGE,
} from "./minors";

const NOW = new Date("2026-09-06T10:00:00.000Z");
const ONLY_ADULTS = { allowsMinors: false, minimumAgeYears: 18 };
const FROM_14 = { allowsMinors: true, minimumAgeYears: 14 };
const FROM_16 = { allowsMinors: true, minimumAgeYears: 16 };

function born(yearsAgo: number): Date {
  return new Date(Date.UTC(2026 - yearsAgo, 8, 6));
}

const FULL_GUARDIAN = {
  name: "María Ruiz",
  idDocument: "12345678Z",
  consentAt: new Date("2026-09-06T09:00:00.000Z"),
  evidence: "Consentimiento firmado 2026-09-06, exp. 118",
};

/**
 * E10-12, escenario principal: un centro que no admite menores no puede dar de
 * alta a uno. No había NINGUNA comprobación de edad en ningún flujo.
 */
test("un centro que solo admite mayores bloquea el alta de un menor, y dice por qué", () => {
  const result = evaluateAgeAdmission({ birthDate: born(15), policy: ONLY_ADULTS, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "menores_no_admitidos");
  assert.match(result.ok === false ? result.message : "", /solo admite socios mayores de 18/);
});

test("sin fecha de nacimiento el alta no se completa", () => {
  const result = evaluateAgeAdmission({ birthDate: null, policy: ONLY_ADULTS, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "sin_fecha_de_nacimiento");
});

test("un adulto pasa sin tutor", () => {
  const result = evaluateAgeAdmission({ birthDate: born(30), policy: ONLY_ADULTS, now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.minor, false);
  assert.equal(result.ok && result.guardianRequired, false);
});

/** Escenario "socio menor de 14": consentimiento del tutor verificable o nada. */
test("un menor admitido sin consentimiento acreditable del tutor no se da de alta", () => {
  const sinTutor = evaluateAgeAdmission({ birthDate: born(15), policy: FROM_14, now: NOW });
  assert.equal(sinTutor.ok, false);
  assert.equal(sinTutor.ok === false && sinTutor.reason, "falta_consentimiento_del_tutor");

  const conTutor = evaluateAgeAdmission({
    birthDate: born(15),
    policy: FROM_14,
    guardian: FULL_GUARDIAN,
    now: NOW,
  });
  assert.equal(conTutor.ok, true);
  assert.equal(conTutor.ok && conTutor.guardianRequired, true);
});

/** Escenario "entre 14 y 18": manda la política declarada por el centro. */
test("entre 14 y 18 manda la edad mínima que declare el centro", () => {
  const bajoMinimo = evaluateAgeAdmission({
    birthDate: born(15),
    policy: FROM_16,
    guardian: FULL_GUARDIAN,
    now: NOW,
  });
  assert.equal(bajoMinimo.ok, false);
  assert.equal(bajoMinimo.ok === false && bajoMinimo.reason, "por_debajo_de_la_edad_minima");

  const sobreMinimo = evaluateAgeAdmission({
    birthDate: born(17),
    policy: FROM_16,
    guardian: FULL_GUARDIAN,
    now: NOW,
  });
  assert.equal(sobreMinimo.ok, true);
});

/**
 * El suelo del art. 7 LOPDGDD no lo puede relajar un centro: por debajo de 14
 * el consentimiento del dato de salud es nulo, con tutor o sin él.
 */
test("un centro no puede configurar una edad mínima por debajo de los 14 del art. 7", () => {
  const result = evaluateAgeAdmission({
    birthDate: born(12),
    policy: { allowsMinors: true, minimumAgeYears: 8 },
    guardian: FULL_GUARDIAN,
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "por_debajo_de_la_edad_minima");
  assert.match(result.ok === false ? result.message : "", new RegExp(`${LOPDGDD_CONSENT_AGE} años`));
});

test("el consentimiento del tutor exige quién, identificación, cuándo y justificante", () => {
  assert.equal(hasVerifiableGuardianConsent(FULL_GUARDIAN), true);
  assert.equal(hasVerifiableGuardianConsent({ ...FULL_GUARDIAN, idDocument: null }), false);
  assert.equal(hasVerifiableGuardianConsent({ ...FULL_GUARDIAN, evidence: "  " }), false);
  assert.equal(hasVerifiableGuardianConsent({ ...FULL_GUARDIAN, consentAt: null }), false);
  assert.equal(hasVerifiableGuardianConsent(null), false);
});

/** Escenario "leads": el formulario público no capta datos de salud de menores. */
test("el formulario público no capta salud de un menor, tenga 13 o 17", () => {
  assert.equal(canCaptureLeadHealthData({ birthDate: born(13), now: NOW }), false);
  assert.equal(canCaptureLeadHealthData({ birthDate: born(17), now: NOW }), false);
  assert.equal(canCaptureLeadHealthData({ birthDate: born(18), now: NOW }), true);
  assert.equal(canCaptureLeadHealthData({ birthDate: null, now: NOW }), false);
});

test("la edad se calcula en UTC: quien cumple hoy ya los tiene", () => {
  assert.equal(ageOn(new Date(Date.UTC(2008, 8, 6)), NOW), ADULT_AGE);
  assert.equal(ageOn(new Date(Date.UTC(2008, 8, 7)), NOW), ADULT_AGE - 1);
});

test("una fecha imposible no pasa por buena", () => {
  const futuro = evaluateAgeAdmission({ birthDate: new Date(Date.UTC(2030, 0, 1)), policy: ONLY_ADULTS, now: NOW });
  assert.equal(futuro.ok, false);
  assert.equal(futuro.ok === false && futuro.reason, "fecha_no_valida");
});

test("el rótulo de la política dice lo que el centro admite", () => {
  assert.match(agePolicyLabel(ONLY_ADULTS), /Solo mayores de 18/);
  assert.match(agePolicyLabel(FROM_16), /A partir de 16/);
  // Un centro que declara 10 sigue viendo 14: el suelo legal no se relaja.
  assert.match(agePolicyLabel({ allowsMinors: true, minimumAgeYears: 10 }), /A partir de 14/);
});

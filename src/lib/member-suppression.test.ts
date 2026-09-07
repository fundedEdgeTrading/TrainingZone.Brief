import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import { buildSuppressionPlan, type SuppressionCounts } from "./member-suppression";
import { RETENTION_DEFAULTS, effectiveRetentionDays, retentionElapsed } from "./data-retention";

const COUNTS: SuppressionCounts = {
  payments: 14,
  healthRecords: 3,
  progressEntries: 6,
  bookings: 120,
  notes: 9,
  auditLogEntries: 200,
  hasPortalAccount: true,
};

function plan(overrides: Partial<Parameters<typeof buildSuppressionPlan>[0]> = {}) {
  return buildSuppressionPlan({
    memberId: "m1",
    counts: COUNTS,
    healthRetentionElapsed: false,
    healthRetentionDays: RETENTION_DEFAULTS.HEALTH_DATA.retentionDays,
    ...overrides,
  });
}

function effect(key: string, overrides?: Parameters<typeof plan>[0]) {
  const found = plan(overrides).effects.find((e) => e.key === key);
  assert.ok(found, `no hay efecto para ${key}`);
  return found;
}

/**
 * E10-09, escenario principal: borrar un socio NO puede destruir justificantes
 * de cobro dentro del plazo de prescripción fiscal (art. 200 LGT). El código
 * ejecutaba `payment.deleteMany`.
 */
test("los cobros se disocian, nunca se borran", () => {
  const payments = effect("payments");
  assert.equal(payments.action, "DISSOCIATE");
  assert.match(payments.detail, /Se conservan los 14 cobros/);
  assert.match(payments.detail, /contabilidad del periodo/);
});

test("sin cobros el plan lo dice, y sigue sin borrar nada", () => {
  const payments = effect("payments", { counts: { ...COUNTS, payments: 0 } });
  assert.equal(payments.action, "DISSOCIATE");
  assert.match(payments.detail, /No hay cobros/);
});

/** Escenario "datos de salud": según la tabla de plazos, no siempre igual. */
test("dentro de plazo la salud se anonimiza; vencido el plazo se borra", () => {
  assert.equal(effect("healthRecords").action, "ANONYMIZE");
  assert.equal(effect("healthRecords", { healthRetentionElapsed: true }).action, "DELETE");
});

/**
 * Escenario "el texto del diálogo": el diálogo pinta este plan, así que cada
 * bloque tiene que traer su propia frase. Un efecto sin detalle es una promesa
 * en pantalla que nadie ha escrito.
 */
test("todos los bloques traen su descripción campo por campo", () => {
  const effects = plan().effects;
  const keys = effects.map((e) => e.key);
  for (const expected of ["payments", "healthRecords", "progressEntries", "bookings", "notes", "identity", "auditLog"]) {
    assert.ok(keys.includes(expected as (typeof keys)[number]), `falta el bloque ${expected}`);
  }
  for (const e of effects) {
    assert.ok(e.detail.trim().length > 0, `${e.key} sin detalle`);
    assert.ok(e.label.trim().length > 0, `${e.key} sin rótulo`);
  }
});

test("sin cuenta de portal no se promete borrar una cuenta que no existe", () => {
  const keys = plan({ counts: { ...COUNTS, hasPortalAccount: false } }).effects.map((e) => e.key);
  assert.equal(keys.includes("portalAccount"), false);
});

/** Escenario "traza": la supresión ANOTA en el log, no lo reescribe (E10-14). */
test("la traza se anota, no se edita", () => {
  const audit = effect("auditLog");
  assert.equal(audit.action, "ANONYMIZE");
  assert.match(audit.detail, /no se reescribe/);
});

// --- Tabla de plazos (E10-08), en lo que E10-09 se apoya ---

test("el plazo configurado nunca puede bajar del suelo legal", () => {
  const relaxed = effectiveRetentionDays("CONTRACT_BILLING", { retentionDays: 30, minimumLegalDays: 0 });
  assert.equal(relaxed, RETENTION_DEFAULTS.CONTRACT_BILLING.minimumLegalDays);
});

test("un plazo más largo que el de partida se respeta tal cual", () => {
  const longer = effectiveRetentionDays("HEALTH_DATA", { retentionDays: 10 * 365, minimumLegalDays: 0 });
  assert.equal(longer, 10 * 365);
});

test("sin fecha de fin de relación el plazo no ha empezado a correr", () => {
  assert.equal(retentionElapsed(null, 365, new Date("2026-09-06")), false);
});

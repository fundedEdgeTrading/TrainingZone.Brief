import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  decidePrenotification,
  isSepaMandate,
  mandateReference,
  nextMonthlyChargeDate,
  prenotificationKey,
  resolveSepaNoticeDays,
  SEPA_DEFAULT_NOTICE_DAYS,
  SEPA_REFUND_WEEKS,
} from "./sepa-prenotification";
import { renderSepaPrenotificationEmail } from "./emails/templates";

const NOW = new Date("2026-09-06T09:00:00.000Z");

function decide(overrides: Partial<Parameters<typeof decidePrenotification>[0]> = {}) {
  return decidePrenotification({
    hasMandate: true,
    chargeDate: new Date("2026-09-20T00:00:00.000Z"),
    noticeDays: SEPA_DEFAULT_NOTICE_DAYS,
    now: NOW,
    alreadySent: false,
    ...overrides,
  });
}

/**
 * E10-13, escenario principal: el preaviso sale con al menos 14 días naturales
 * de antelación. Antes no salía nunca: de las once plantillas, la única de
 * cobro era la de pago fallido, POSTERIOR al fallo.
 */
test("el preaviso salta a los 14 días del cargo, no antes", () => {
  const trece = decide({ chargeDate: new Date("2026-09-19T00:00:00.000Z") });
  assert.equal(trece.send, true);
  assert.equal(trece.send && trece.daysAhead, 12);

  const lejos = decide({ chargeDate: new Date("2026-10-15T00:00:00.000Z") });
  assert.equal(lejos.send, false);
  assert.equal(lejos.send === false && lejos.reason, "aun_no_toca");
});

test("un preaviso con menos días de los debidos sale marcado como tardío", () => {
  const puntual = decide({ chargeDate: new Date("2026-09-20T09:00:00.000Z") });
  assert.equal(puntual.send && puntual.late, false);

  const tarde = decide({ chargeDate: new Date("2026-09-16T09:00:00.000Z") });
  assert.equal(tarde.send, true);
  assert.equal(tarde.send && tarde.late, true);
});

test("no se manda dos veces el mismo preaviso ni se avisa de un cargo pasado", () => {
  assert.equal(decide({ alreadySent: true }).send, false);
  assert.equal(decide({ chargeDate: new Date("2026-09-01T00:00:00.000Z") }).send, false);
});

test("sin domiciliación no hay preaviso que mandar", () => {
  const sin = decide({ hasMandate: false });
  assert.equal(sin.send, false);
  assert.equal(sin.send === false && sin.reason, "sin_mandato");
  assert.equal(isSepaMandate("SEPA"), true);
  assert.equal(isSepaMandate("CARD"), false);
  assert.equal(isSepaMandate(null), false);
});

/** Escenario "pacto distinto": vale el pactado, y tiene que constar por escrito. */
test("un plazo más corto solo se aplica si consta el pacto por escrito", () => {
  const sinPacto = resolveSepaNoticeDays({ configuredDays: 5, agreedInWriting: false });
  assert.equal(sinPacto.days, SEPA_DEFAULT_NOTICE_DAYS);
  assert.equal(sinPacto.agreed, false);

  const conPacto = resolveSepaNoticeDays({ configuredDays: 5, agreedInWriting: true });
  assert.equal(conPacto.days, 5);
  assert.equal(conPacto.agreed, true);
  assert.match(conPacto.basis, /por escrito/);
});

test("un plazo más largo que el general siempre vale: beneficia al deudor", () => {
  const largo = resolveSepaNoticeDays({ configuredDays: 30 });
  assert.equal(largo.days, 30);
  assert.equal(largo.agreed, true);
});

test("sin configuración se aplica el plazo general del esquema SEPA Core", () => {
  assert.equal(resolveSepaNoticeDays({}).days, SEPA_DEFAULT_NOTICE_DAYS);
  assert.equal(resolveSepaNoticeDays({ configuredDays: 0 }).days, SEPA_DEFAULT_NOTICE_DAYS);
});

/** Escenario "plantilla": importe, fecha y mandato, y el plazo de devolución. */
test("la plantilla lleva importe, fecha, mandato y el plazo de devolución de 8 semanas", () => {
  const html = renderSepaPrenotificationEmail({
    memberFirstName: "Ana",
    brandName: "Training Zone",
    brandLogoUrl: "https://example.test/logo.png",
    amountLabel: "59,00 €",
    chargeDateLabel: "20/09/2026",
    mandateReference: "TZ-ABC12345",
    noticeDaysLabel: "14 días de antelación",
    planName: "Cuota mensual",
    portalUrl: "https://example.test/portal/membresia",
  });
  assert.match(html, /59,00/);
  assert.match(html, /20\/09\/2026/);
  assert.match(html, /TZ-ABC12345/);
  assert.match(html, new RegExp(`${SEPA_REFUND_WEEKS} semanas`));
});

/**
 * Escenario "es correo de servicio": el pie NO ofrece darse de baja. Un enlace
 * de preferencias en un aviso obligatorio promete algo que no se puede cumplir.
 */
test("el preaviso no ofrece desactivarse: es correo de servicio", () => {
  const html = renderSepaPrenotificationEmail({
    memberFirstName: "Ana",
    brandName: "Training Zone",
    brandLogoUrl: "https://example.test/logo.png",
    amountLabel: "59,00 €",
    chargeDateLabel: "20/09/2026",
    mandateReference: "TZ-ABC12345",
    noticeDaysLabel: "14 días de antelación",
    portalUrl: "https://example.test/portal/membresia",
  });
  assert.equal(/Preferencias de correo/.test(html), false);
  assert.match(html, /no se puede desactivar/);
});

test("el aniversario mensual no se desborda desde un día 31", () => {
  const alta = new Date(2026, 0, 31); // 31 de enero
  const siguiente = nextMonthlyChargeDate(alta, new Date(2026, 1, 1));
  assert.equal(siguiente.getMonth(), 1); // febrero
  assert.equal(siguiente.getDate(), 28);
});

test("la clave de idempotencia es una por suscripción y fecha de cargo", () => {
  const a = prenotificationKey("sub_1", new Date("2026-09-20T00:00:00.000Z"));
  assert.equal(a, "sub_1:2026-09-20");
  assert.notEqual(a, prenotificationKey("sub_1", new Date("2026-10-20T00:00:00.000Z")));
});

test("la referencia del mandato no expone el IBAN ni el id completo", () => {
  const ref = mandateReference("sub_abcdefghijklmnop");
  assert.match(ref, /^TZ-[A-Z0-9]{8}$/);
});

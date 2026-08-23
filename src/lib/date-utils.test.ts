import test from "node:test";
import assert from "node:assert/strict";
import { addMonthsClamped, formatInstantDate, formatInstantDateTime, isBirthdayOn } from "./date-utils";

// Los dos casos borde de las reglas de cron F4/F5 (el día 31 y el 29 de
// febrero) se escriben aquí antes que en la regla: son fallos que solo se
// manifiestan un día concreto del año y no los ve nadie hasta que ya han
// dejado sin valoración o sin felicitación a un socio.

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("addMonthsClamped: el aniversario de mes de un alta del 31 cae el último día del mes", () => {
  assert.equal(addMonthsClamped(day("2026-01-31"), 1).getTime(), day("2026-02-28").getTime());
  assert.equal(addMonthsClamped(day("2024-01-31"), 1).getTime(), day("2024-02-29").getTime());
  assert.equal(addMonthsClamped(day("2026-01-31"), 3).getTime(), day("2026-04-30").getTime());
  assert.equal(addMonthsClamped(day("2026-03-31"), 6).getTime(), day("2026-09-30").getTime());
});

test("addMonthsClamped: cruza el año sin desbordar", () => {
  assert.equal(addMonthsClamped(day("2026-12-31"), 1).getTime(), day("2027-01-31").getTime());
  assert.equal(addMonthsClamped(day("2026-08-22"), 12).getTime(), day("2027-08-22").getTime());
});

test("addMonthsClamped: un día que existe en el mes destino no se toca", () => {
  assert.equal(addMonthsClamped(day("2026-08-22"), 1).getTime(), day("2026-09-22").getTime());
  assert.equal(addMonthsClamped(day("2026-08-22"), 9).getTime(), day("2027-05-22").getTime());
});

test("isBirthdayOn: coincide el día y mes, no el año", () => {
  assert.equal(isBirthdayOn(utcDay("1990-08-22"), day("2026-08-22")), true);
  assert.equal(isBirthdayOn(utcDay("1990-08-22"), day("2026-08-21")), false);
  assert.equal(isBirthdayOn(utcDay("1990-08-22"), day("2026-09-22")), false);
});

test("isBirthdayOn: el 29 de febrero se felicita el 28 solo en años no bisiestos", () => {
  assert.equal(isBirthdayOn(utcDay("1992-02-29"), day("2026-02-28")), true);
  assert.equal(isBirthdayOn(utcDay("1992-02-29"), day("2024-02-28")), false);
  assert.equal(isBirthdayOn(utcDay("1992-02-29"), day("2024-02-29")), true);
  // Y no arrastra a quien nació el 28: ese no se felicita dos veces.
  assert.equal(isBirthdayOn(utcDay("1992-02-28"), day("2026-02-28")), true);
  assert.equal(isBirthdayOn(utcDay("1992-02-28"), day("2024-02-29")), false);
});

test("isBirthdayOn: 2100 no es bisiesto pese a ser múltiplo de 4", () => {
  assert.equal(isBirthdayOn(utcDay("1992-02-29"), day("2100-02-28")), true);
  assert.equal(isBirthdayOn(utcDay("1992-02-29"), day("2000-02-28")), false);
});

test("formatInstantDate usa el reloj del centro, no el del servidor (UTC)", () => {
  // 23/08/2026 22:30 UTC son ya las 00:30 del 24 en Madrid: la fecha que ve
  // quien mira la pantalla es la del 24, no la del 23.
  const instant = new Date("2026-08-23T22:30:00.000Z");
  assert.equal(formatInstantDate(instant, "Europe/Madrid"), "24/08/2026");
  assert.equal(formatInstantDate(instant, "UTC"), "23/08/2026");
});

test("formatInstantDateTime añade la hora de pared de esa zona", () => {
  const instant = new Date("2026-01-15T08:05:00.000Z");
  assert.equal(formatInstantDateTime(instant, "Europe/Madrid"), "15/01/2026, 09:05");
});

test("una zona horaria inválida cae a España en vez de reventar", () => {
  const instant = new Date("2026-08-23T22:30:00.000Z");
  assert.equal(formatInstantDate(instant, "No/Existe"), "24/08/2026");
});

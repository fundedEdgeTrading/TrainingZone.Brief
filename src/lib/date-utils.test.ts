import test from "node:test";
import assert from "node:assert/strict";
import { addMonthsClamped } from "./date-utils";

// El caso borde de la regla de valoraciones (el día 31) se escribe aquí antes
// que en la regla: es un fallo que solo se manifiesta unos días concretos del
// año y no lo ve nadie hasta que ya ha dejado sin valoración a un socio.

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

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

import test from "node:test";
import assert from "node:assert/strict";

import {
  asOpeningHours,
  formatOpeningHours,
  openingHoursRows,
  parseOpeningHours,
  toSchemaOpeningHours,
} from "@/lib/opening-hours";

/**
 * E9-05 · `Center.openingHours` es `Json?` y el esquema dejó la forma sin fijar.
 * La fija este módulo, así que lo que se comprueba aquí es el contrato: que lo
 * que escribe dirección se pueda volver a leer, y que lo que llega de la base de
 * datos se valide en vez de confiarse.
 */

test("una línea por día, con dos franjas y con días cerrados", () => {
  const result = parseOpeningHours("Lunes: 07:00-14:00, 16:00-22:00\nSábado: 09:00-14:00\nDomingo: cerrado");
  assert.ok(result.ok);
  assert.deepEqual(result.value, {
    mon: ["07:00-14:00", "16:00-22:00"],
    sat: ["09:00-14:00"],
    sun: [],
  });
});

test("vacío es «no hay horario cargado», no «cerrado todos los días»", () => {
  const result = parseOpeningHours("   ");
  assert.ok(result.ok);
  // La diferencia importa: un centro sin horario no debe publicar un rótulo que
  // diga que nunca abre.
  assert.equal(result.value, null);
});

test("el día se reconoce con tildes, sin ellas y por su clave", () => {
  for (const line of ["Miércoles: 07:00-22:00", "miercoles: 07:00-22:00", "wed: 07:00-22:00"]) {
    const result = parseOpeningHours(line);
    assert.ok(result.ok, line);
    assert.deepEqual(result.value, { wed: ["07:00-22:00"] });
  }
});

test("lo que no se entiende se rechaza con un mensaje que dice qué arreglar", () => {
  const noDay = parseOpeningHours("Lunnes: 07:00-22:00");
  assert.equal(noDay.ok, false);
  assert.match(noDay.ok ? "" : noDay.error, /no es un día/);

  const badRange = parseOpeningHours("Lunes: de 7 a 10");
  assert.equal(badRange.ok, false);

  const backwards = parseOpeningHours("Lunes: 22:00-07:00");
  assert.equal(backwards.ok, false);
  assert.match(backwards.ok ? "" : backwards.error, /acaba antes de empezar/);

  const twice = parseOpeningHours("Lunes: 07:00-14:00\nLunes: 16:00-22:00");
  assert.equal(twice.ok, false);
});

test("ida y vuelta: lo que guarda dirección es lo que vuelve a ver al editar", () => {
  const text = "Lunes: 07:00-14:00, 16:00-22:00\nSábado: 09:00-14:00\nDomingo: cerrado";
  const parsed = parseOpeningHours(text);
  assert.ok(parsed.ok);
  assert.equal(formatOpeningHours(parsed.value), text);
});

test("las filas de la ficha pública salen en orden de semana", () => {
  const parsed = parseOpeningHours("Domingo: cerrado\nLunes: 07:00-22:00");
  assert.ok(parsed.ok);
  assert.deepEqual(openingHoursRows(parsed.value), [
    { day: "mon", label: "Lunes", value: "07:00-22:00" },
    { day: "sun", label: "Domingo", value: "Cerrado" },
  ]);
});

test("el JSON-LD de E9-07 recibe el formato de schema.org", () => {
  const parsed = parseOpeningHours("Lunes: 07:00-14:00, 16:00-22:00\nSábado: 09:00-14:00");
  assert.ok(parsed.ok);
  assert.deepEqual(toSchemaOpeningHours(parsed.value), ["Mo 07:00-14:00", "Mo 16:00-22:00", "Sa 09:00-14:00"]);
  assert.deepEqual(toSchemaOpeningHours(null), []);
});

test("lo que llega de Prisma es JsonValue: se valida, no se castea", () => {
  assert.deepEqual(asOpeningHours({ mon: ["07:00-22:00"] }), { mon: ["07:00-22:00"] });
  assert.equal(asOpeningHours({ mon: ["siempre"] }), null);
  assert.equal(asOpeningHours({ mon: "07:00-22:00" }), null);
  assert.equal(asOpeningHours(["07:00-22:00"]), null);
  assert.equal(asOpeningHours(null), null);
  assert.equal(asOpeningHours("cerrado"), null);
});

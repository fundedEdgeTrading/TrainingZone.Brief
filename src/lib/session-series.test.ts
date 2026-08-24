import test from "node:test";
import assert from "node:assert/strict";
import { parseDateParam, formatDateParam } from "./date-utils";
import { dayDelta, effectiveScope, nextOccurrenceAfter, parseEditScope, truncatedRecUntil } from "./session-series";
import { withTypePrefix } from "@/app/(app)/agenda/agenda-utils";

// Una serie recurrente es UNA fila de ClassSession, así que editarla es
// decidir dónde se parte. Estos tests fijan esa aritmética: qué ocurrencia
// viene después, hasta dónde se recorta el tramo que ya pasó y cuándo pedir
// alcance no aporta nada porque solo hay una respuesta posible.

const d = (iso: string) => parseDateParam(iso);
const weekly = (date: string, recUntil: string | null = null) => ({
  date: d(date),
  recurrence: "WEEKLY" as const,
  recUntil: recUntil ? d(recUntil) : null,
});
const weekdays = (date: string, recUntil: string | null = null) => ({
  date: d(date),
  recurrence: "WEEKDAYS" as const,
  recUntil: recUntil ? d(recUntil) : null,
});

test("nextOccurrenceAfter: una serie semanal repite a los siete días", () => {
  const s = weekly("2026-08-04"); // martes
  assert.equal(formatDateParam(nextOccurrenceAfter(s, d("2026-08-18"))!), "2026-08-25");
});

test("nextOccurrenceAfter: una serie L–V salta el fin de semana", () => {
  const s = weekdays("2026-08-03");
  assert.equal(formatDateParam(nextOccurrenceAfter(s, d("2026-08-21"))!), "2026-08-24"); // viernes → lunes
});

test("nextOccurrenceAfter: no hay siguiente si la serie acaba ahí", () => {
  assert.equal(nextOccurrenceAfter(weekly("2026-08-04", "2026-08-18"), d("2026-08-18")), null);
  assert.equal(nextOccurrenceAfter({ date: d("2026-08-18"), recurrence: "NONE", recUntil: null }, d("2026-08-18")), null);
});

test("effectiveScope: sin recurrencia no hay nada que elegir", () => {
  const single = { date: d("2026-08-18"), recurrence: "NONE" as const, recUntil: null };
  assert.equal(effectiveScope(single, d("2026-08-18"), "single"), "all");
  assert.equal(effectiveScope(single, d("2026-08-18"), "future"), "all");
});

test("effectiveScope: 'esta y las posteriores' sobre la primera ocurrencia es la serie entera", () => {
  // No hay pasado que preservar, así que partir la serie solo dejaría un
  // fragmento vacío delante.
  assert.equal(effectiveScope(weekly("2026-08-04"), d("2026-08-04"), "future"), "all");
  assert.equal(effectiveScope(weekly("2026-08-04"), d("2026-08-11"), "future"), "future");
});

test("effectiveScope: 'solo esta' necesita que haya algo más en la serie", () => {
  // Última ocurrencia de una serie que ya tiene pasado: sí se puede sacar sola.
  assert.equal(effectiveScope(weekly("2026-08-04", "2026-08-18"), d("2026-08-18"), "single"), "single");
  // Serie de una sola ocurrencia: sacarla equivale a editarla entera.
  assert.equal(effectiveScope(weekly("2026-08-04", "2026-08-04"), d("2026-08-04"), "single"), "all");
});

test("truncatedRecUntil: el tramo anterior se cierra la víspera del día editado", () => {
  assert.equal(formatDateParam(truncatedRecUntil(weekly("2026-08-04"), d("2026-08-18"))), "2026-08-17");
});

test("truncatedRecUntil: no alarga una serie que ya terminaba antes", () => {
  const s = weekly("2026-06-02", "2026-07-01");
  assert.equal(formatDateParam(truncatedRecUntil(s, d("2026-08-18"))), "2026-07-01");
});

test("dayDelta: mide días completos entre medianoches, también al cruzar un mes", () => {
  assert.equal(dayDelta(d("2026-08-18"), d("2026-08-18")), 0);
  assert.equal(dayDelta(d("2026-08-18"), d("2026-08-20")), 2);
  assert.equal(dayDelta(d("2026-09-01"), d("2026-08-30")), -2);
  // Cambio de hora en Europa/Madrid (29-03-2026): el día dura 23 h y una resta
  // en milisegundos daba 0,958 días.
  assert.equal(dayDelta(d("2026-03-28"), d("2026-03-30")), 2);
});

test("parseEditScope: lo que no sea un alcance conocido edita la serie entera", () => {
  assert.equal(parseEditScope("single"), "single");
  assert.equal(parseEditScope("future"), "future");
  assert.equal(parseEditScope(null), "all");
  assert.equal(parseEditScope("cualquier-cosa"), "all");
});

test("withTypePrefix: el tipo elegido escribe el prefijo del título", () => {
  assert.equal(withTypePrefix("", "personal"), "EP ");
  assert.equal(withTypePrefix("", "reduced"), "Grupo ");
  assert.equal(withTypePrefix("Marta García", "personal"), "EP Marta García");
  assert.equal(withTypePrefix("Espalda", "reduced"), "Grupo Espalda");
});

test("withTypePrefix: cambiar de tipo sustituye el prefijo, no lo encadena", () => {
  assert.equal(withTypePrefix("EP Marta García", "reduced"), "Grupo Marta García");
  assert.equal(withTypePrefix("Grupo Espalda", "personal"), "EP Espalda");
  // Idempotente: volver a pulsar el mismo tipo no duplica nada.
  assert.equal(withTypePrefix("EP Marta García", "personal"), "EP Marta García");
  assert.equal(withTypePrefix("Grupo reducido", "reduced"), "Grupo reducido");
  assert.equal(withTypePrefix("EP", "personal"), "EP ");
});

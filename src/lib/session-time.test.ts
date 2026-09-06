import test from "node:test";
import assert from "node:assert/strict";
import { checkSessionSchedule, isValidDateParam, isValidHHMM } from "@/lib/session-time";

/**
 * E2-12: las tres vías de escritura de agenda (`moveSessionAction`, `POST
 * /agenda/sessions` y su `PATCH`) validan igual porque validan AQUÍ.
 *
 * Antes: `session-actions.ts` tenía su propio `isValidHHMM`, el endpoint de
 * huecos de EP su propio `TIME_RE`, y el arrastrar-y-soltar y los dos endpoints
 * de sesión no validaban nada — así llegaba "NaN:NaN" a `ClassSession`.
 */

test('"NaN:NaN" no es una hora', () => {
  assert.equal(isValidHHMM("NaN:NaN"), false);
  assert.equal(checkSessionSchedule({ date: "2026-09-10", startTime: "NaN:NaN" }).ok, false);
});

test("una hora fuera de rango o vacía se rechaza", () => {
  for (const bad of ["25:00", "24:00", "12:60", "", "9:00", "09:0", "09:00:00", " 09:00", "0900"]) {
    assert.equal(isValidHHMM(bad), false, `"${bad}" no debería pasar`);
  }
  for (const good of ["00:00", "09:00", "23:59", "19:45"]) {
    assert.equal(isValidHHMM(good), true, `"${good}" debería pasar`);
  }
});

test("la fecha se valida de verdad, no solo su forma", () => {
  assert.equal(isValidDateParam("2026-09-10"), true);
  assert.equal(isValidDateParam("2028-02-29"), true, "año bisiesto");

  assert.equal(isValidDateParam(""), false);
  assert.equal(isValidDateParam("10/09/2026"), false);
  assert.equal(isValidDateParam("2026-13-01"), false);
  // `parseDateParam` la convertiría en el 3 de marzo sin decir nada.
  assert.equal(isValidDateParam("2026-02-31"), false);
  assert.equal(isValidDateParam("NaN-NaN-NaN"), false);
});

test("el fin tiene que ser posterior al inicio", () => {
  const at = (startTime: string, endTime: string) =>
    checkSessionSchedule({ date: "2026-09-10", startTime, endTime });

  assert.equal(at("10:00", "11:00").ok, true);
  assert.equal(at("10:00", "09:00").ok, false, "fin antes que el inicio");
  assert.equal(at("10:00", "10:00").ok, false, "duración cero tampoco es una sesión");
});

test("sin hora de fin la comprobación pasa: el formulario la calcula después", () => {
  assert.equal(checkSessionSchedule({ date: "2026-09-10", startTime: "10:00" }).ok, true);
  assert.equal(checkSessionSchedule({ date: "2026-09-10", startTime: "10:00", endTime: "" }).ok, true);
  // Pero escrita y corrupta sigue siendo un rechazo, no un silencio.
  assert.equal(checkSessionSchedule({ date: "2026-09-10", startTime: "10:00", endTime: "25:00" }).ok, false);
});

test("cada rechazo dice qué campo está mal", () => {
  const bad = (input: Parameters<typeof checkSessionSchedule>[0]) => {
    const result = checkSessionSchedule(input);
    assert.equal(result.ok, false);
    return result.ok ? "" : result.error;
  };

  assert.match(bad({ date: "ayer", startTime: "10:00" }), /fecha/);
  assert.match(bad({ date: "2026-09-10", startTime: "25:00" }), /inicio/);
  assert.match(bad({ date: "2026-09-10", startTime: "10:00", endTime: "99:99" }), /fin/);
  assert.match(bad({ date: "2026-09-10", startTime: "10:00", endTime: "09:00" }), /posterior/);
});

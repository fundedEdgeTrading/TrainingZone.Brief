import test from "node:test";
import assert from "node:assert/strict";
import { mapLegacyZone, ruleMatchesRecord, injuryZoneLabel, defaultSideFor } from "@/lib/injury-zones";

/**
 * E3-02 · Las zonas de lesión son un enum cerrado, con lateralidad como campo
 * aparte. Lo que se prueba aquí es lo que estaba roto: el emparejamiento entre
 * la regla de aptitud y el registro de salud, que se hacía por igualdad de dos
 * textos libres y dejaba seis de las ocho zonas de la valoración sin regla.
 */

test("E3-02 · regla sin lado: casa con la lesión del lado que sea", () => {
  const regla = { zoneCode: "HOMBRO" as const, side: null };

  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: "DERECHA" }), true);
  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: "IZQUIERDA" }), true);
  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: "BILATERAL" }), true);
  // Y sigue siendo una regla de hombro: no se contagia a otra zona.
  assert.equal(ruleMatchesRecord(regla, { zoneCode: "RODILLA", side: "DERECHA" }), false);
});

test("E3-02 · regla con lado: no casa con la lesión del otro lado", () => {
  const regla = { zoneCode: "HOMBRO" as const, side: "IZQUIERDA" as const };

  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: "DERECHA" }), false);
  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: "IZQUIERDA" }), true);
  // Bilateral incluye el lado de la regla, así que sí casa.
  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: "BILATERAL" }), true);
  // Lado sin declarar: casa. En un semáforo de salud, perder un aviso por un
  // dato que nadie rellenó es peor que darlo de más.
  assert.equal(ruleMatchesRecord(regla, { zoneCode: "HOMBRO", side: null }), true);
});

test("E3-02 · sin zona del catálogo no hay emparejamiento posible", () => {
  assert.equal(ruleMatchesRecord({ zoneCode: null, side: null }, { zoneCode: "HOMBRO", side: null }), false);
  assert.equal(ruleMatchesRecord({ zoneCode: "HOMBRO", side: null }, { zoneCode: null, side: null }), false);
});

test("E3-02 · las zonas axiales no tienen lado", () => {
  assert.equal(defaultSideFor("LUMBAR"), "NO_APLICA");
  assert.equal(defaultSideFor("CERVICALES"), "NO_APLICA");
  assert.equal(defaultSideFor("HOMBRO"), null);
  assert.equal(injuryZoneLabel("LUMBAR", "NO_APLICA"), "Zona lumbar");
  assert.equal(injuryZoneLabel("HOMBRO", "DERECHA"), "Hombro derecho");
  assert.equal(injuryZoneLabel("RODILLA", "BILATERAL"), "Rodilla (bilateral)");
});

test("E3-02 · el mapeo del texto libre separa zona y lado", () => {
  // Las cuatro formas que convivían en la base y que no casaban entre sí.
  for (const escrito of ["hombro derecho", "Hombro Dcho.", "HOMBRO DER", "hombro  dcha"]) {
    assert.deepEqual(mapLegacyZone(escrito), { zone: "HOMBRO", side: "DERECHA" }, escrito);
  }
  assert.deepEqual(mapLegacyZone("rodilla izquierda"), { zone: "RODILLA", side: "IZQUIERDA" });
  assert.deepEqual(mapLegacyZone("zona lumbar"), { zone: "LUMBAR", side: "NO_APLICA" });
  assert.deepEqual(mapLegacyZone("cervicales"), { zone: "CERVICALES", side: "NO_APLICA" });
  // "espalda alta" es dorsal, no lumbar: la clave más larga gana.
  assert.deepEqual(mapLegacyZone("espalda alta"), { zone: "DORSAL", side: "NO_APLICA" });
  // Zona con lado pero sin lado escrito: no se inventa.
  assert.deepEqual(mapLegacyZone("hombro"), { zone: "HOMBRO", side: null });
});

test("E3-02 · lo que el mapeo no conoce queda sin mapear, nunca adivinado", () => {
  assert.equal(mapLegacyZone("lo de siempre"), null);
  assert.equal(mapLegacyZone(""), null);
  assert.equal(mapLegacyZone(null), null);
  assert.equal(mapLegacyZone("   "), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { isValidPostalCode, postalAreaLabel } from "./postal-codes";

/**
 * El CP se escribe desde tres sitios (ficha del socio, perfil del portal y
 * ficha del lead) y se lee desde uno solo: el join con `PostalCodeArea` que
 * pinta el mapa por barrios. Un CP con espacios, con guion o de cuatro
 * dígitos no casa con ninguna fila de esa tabla, así que la regla de los
 * cinco dígitos es lo que mantiene coherente lo que se guarda por cada vía.
 */

test("acepta un CP español de cinco dígitos", () => {
  assert.equal(isValidPostalCode("50008"), true);
  assert.equal(isValidPostalCode("39001"), true);
  // Los ceros a la izquierda cuentan: Álava, Albacete y Alicante empiezan por 0.
  assert.equal(isValidPostalCode("01001"), true);
});

test("tolera los espacios de quien teclea, no el formato", () => {
  assert.equal(isValidPostalCode(" 50008 "), true);
  assert.equal(isValidPostalCode("50 008"), false);
  assert.equal(isValidPostalCode("50008-2"), false);
});

test("rechaza lo que no cruzaría con el mapa de barrios", () => {
  assert.equal(isValidPostalCode(""), false);
  assert.equal(isValidPostalCode("5008"), false);
  assert.equal(isValidPostalCode("500080"), false);
  assert.equal(isValidPostalCode("5000A"), false);
  // Un CP válido pero sin barrio en la tabla se guarda igual: el mapa lo
  // agrupa por provincia (degradación digna), no lo descarta.
  assert.equal(isValidPostalCode("28001"), true);
  assert.equal(postalAreaLabel("28001"), "Madrid (provincia)");
});

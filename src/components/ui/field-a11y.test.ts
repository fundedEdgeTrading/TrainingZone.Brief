import assert from "node:assert/strict";
import { test } from "node:test";

import { fieldA11y, mergeDescribedBy } from "./field-a11y";

// E8-02 · escenario "asociación": Field deriva un id del `useId()` y lo usa
// tanto en el htmlFor de la etiqueta como en el control.
test("fieldA11y deriva controlId y labelId del id base", () => {
  const a11y = fieldA11y(":r7:");
  assert.equal(a11y.controlId, ":r7:-control");
  assert.equal(a11y.labelId, ":r7:-label");
});

// Escenario "error": el campo con error lleva aria-invalid y aria-describedby
// apuntando al mensaje.
test("fieldA11y marca invalid y describe el error cuando hay error", () => {
  const a11y = fieldA11y("f", { error: "El teléfono no es válido" });
  assert.equal(a11y.invalid, true);
  assert.equal(a11y.errorId, "f-error");
});

// Escenario "ayuda": el hint también se referencia con aria-describedby.
test("fieldA11y describe el hint cuando no hay error", () => {
  const a11y = fieldA11y("f", { hint: "Solo dígitos" });
  assert.equal(a11y.hintId, "f-hint");
  assert.equal(a11y.errorId, undefined);
  assert.equal(a11y.invalid, undefined);
});

// El error tapa al hint en el render, así que describir el hint apuntaría a un
// nodo que no está en el DOM.
test("fieldA11y no describe el hint cuando el error lo tapa", () => {
  const a11y = fieldA11y("f", { hint: "Solo dígitos", error: "Obligatorio" });
  assert.equal(a11y.errorId, "f-error");
  assert.equal(a11y.hintId, undefined);
});

test("fieldA11y no genera ids de mensajes cuando no hay ni error ni hint", () => {
  const a11y = fieldA11y("f");
  assert.equal(a11y.errorId, undefined);
  assert.equal(a11y.hintId, undefined);
  assert.equal(a11y.invalid, undefined);
});

test("mergeDescribedBy conserva los ids del call-site y añade los del campo", () => {
  assert.equal(mergeDescribedBy("propio", "f-error", undefined), "propio f-error");
});

test("mergeDescribedBy no repite ids ni deja atributo vacío", () => {
  assert.equal(mergeDescribedBy("f-error otro", "f-error"), "f-error otro");
  assert.equal(mergeDescribedBy(undefined, undefined), undefined);
  assert.equal(mergeDescribedBy("   "), undefined);
});

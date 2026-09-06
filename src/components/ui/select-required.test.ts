import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E8-14 · el `<input type="hidden" required>` de `Select` queda fuera de la
 * validación de restricciones del navegador (excluida por la propia spec de
 * HTML para `type="hidden"`), así que un `Select` obligatorio vacío nunca
 * bloqueaba el envío ni marcaba el campo culpable (`new-lead-drawer.tsx`:
 * Centro y Canal se enviaban vacíos). Esta historia añade la validación de
 * cliente que faltaba sin tocar la de servidor.
 */

const field = readFileSync(join("src", "components", "ui", "field.tsx"), "utf8");

test("E8-14 · Select intercepta el submit del formulario en captura cuando está vacío y es obligatorio", () => {
  assert.match(field, /addEventListener\("submit",\s*onFormSubmit,\s*true\)/);
  assert.match(field, /if \(!required\) return;/);
  assert.match(field, /currentValue\.trim\(\) !== ""/);
  assert.match(field, /e\.preventDefault\(\);/);
});

test("E8-14 · campo vacío: se bloquea el envío y se marca el campo culpable", () => {
  assert.match(field, /setSelfInvalid\(true\)/);
  assert.match(field, /triggerRef\.current\?\.focus\(\)/);
  assert.match(field, /invalid = ariaInvalid === true \|\| ariaInvalid === "true" \|\| selfInvalid;/);
});

test("E8-14 · el mensaje nombra el campo concreto, no un error genérico", () => {
  assert.match(field, /resolveMissingLabel/);
  assert.match(field, /Falta seleccionar «\{missingLabel \|\| "este campo"\}»\./);
});

test("E8-14 · elegir una opción limpia el estado inválido (no deja el mensaje colgado)", () => {
  const selectOptionBody = field.slice(field.indexOf("function selectOption"), field.indexOf("resolveMissingLabel"));
  assert.match(selectOptionBody, /setSelfInvalid\(false\)/);
});

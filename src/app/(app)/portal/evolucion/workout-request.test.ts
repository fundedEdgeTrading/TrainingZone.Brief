import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// E12-01: la rutina de IA falsa del portal se apaga por completo. No hay
// pantalla que confirme un DRAFT, así que el emisor y el panel se retiran en
// el mismo cambio para no dejar a nadie con el botón bloqueado.

test("E12-01 · el emisor de la rutina falsa ya no existe", () => {
  assert.equal(existsSync(join("src", "lib", "workout-programs.ts")), false);
});

test("E12-01 · la tarjeta y el botón se retiran de portal/evolucion", () => {
  assert.equal(existsSync(join("src", "app", "(app)", "portal", "evolucion", "workout-request-button.tsx")), false);
  assert.equal(existsSync(join("src", "app", "(app)", "portal", "evolucion", "actions.ts")), false);

  const page = readFileSync(join("src", "app", "(app)", "portal", "evolucion", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /RequestWorkoutButton|Tu rutina para casa|listWorkoutPrograms/);
});

test("E12-01 · el código aparcado de confirmación en la ficha de socio se retira", () => {
  assert.equal(existsSync(join("src", "app", "(app)", "members", "[id]", "workout-panel.tsx")), false);
  assert.equal(existsSync(join("src", "app", "(app)", "members", "[id]", "workout-actions.ts")), false);
});

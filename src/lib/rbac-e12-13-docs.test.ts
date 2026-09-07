import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAdjustSessionBalance } from "@/lib/rbac";
import { isOperatingDay } from "@/app/(app)/agenda/agenda-utils";

/**
 * E12-13 · alinear documentación y código. Tres desviaciones concretas entre
 * `docs/CRM_REGLAS_NEGOCIO.md` y el código real:
 *  - RB-RES-008 decía "el centro no opera en domingo" mientras isOperatingDay
 *    devuelve siempre true.
 *  - RB-PAGO-008 daba el ajuste de saldo al entrenador; el código nunca se
 *    lo dio.
 *  - RB-AGENDA-009 no existía en ningún sitio.
 * Los dos primeros se prueban contra el código; el tercero, contra el
 * documento (no hay comportamiento nuevo que probar, solo texto nuevo).
 */

test("E12-13 · isOperatingDay no excluye ningún día (RB-RES-008 revisada)", () => {
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 8, 6 + i); // una semana completa
    assert.equal(isOperatingDay(d), true, `día ${d.toDateString()} debería operar`);
  }
});

test("E12-13 · el entrenador raso no ajusta saldo de bono (RB-PAGO-008 corregida)", () => {
  assert.equal(canAdjustSessionBalance("TRAINER"), false);
  assert.equal(canAdjustSessionBalance("TRAINER_ADMIN"), true);
  assert.equal(canAdjustSessionBalance("RECEPTION"), true);
});

test("E12-13 · RB-AGENDA-009 queda documentada", () => {
  const doc = readFileSync(join("docs", "CRM_REGLAS_NEGOCIO.md"), "utf8");
  assert.match(doc, /RB-AGENDA-009/);
});

test("E12-13 · el filtro de respaldo inalcanzable se retira de portal-queries.ts", () => {
  const source = readFileSync(join("src", "lib", "portal-queries.ts"), "utf8");
  assert.doesNotMatch(source, /isOperatingDay\(s\.date\) \|\| s\.myBookingId/);
});

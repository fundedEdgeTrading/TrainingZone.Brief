import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E8-13 · tablas con scope, aria-sort y paginación en servidor.
 * `data-table.tsx:276-320` no declaraba `scope="col"` en ningún `<th>` y no
 * había ni un `aria-sort` en todo `src/`; el estado de orden dependía solo
 * de una flecha de 10 px al 25% de opacidad.
 */

const dataTable = readFileSync(join("src", "components", "ui", "data-table.tsx"), "utf8");
const billing = readFileSync(join("src", "app", "(app)", "billing", "page.tsx"), "utf8");

test("E8-13 · DataTable declara scope=\"col\" y aria-sort en sus <th>", () => {
  assert.match(dataTable, /scope="col"/);
  assert.match(dataTable, /aria-sort=/);
});

test("E8-13 · el estado de orden se indica con algo más que la flecha (negrita + color)", () => {
  assert.match(dataTable, /font-extrabold/);
});

test("E8-13 · /billing pagina y ordena en servidor, con scope en sus <th>", () => {
  assert.match(billing, /countPayments/);
  assert.match(billing, /params\.page/);
  assert.match(billing, /params\.sort/);
  const thCount = (billing.match(/scope="col"/g) ?? []).length;
  assert.ok(thCount >= 6, `esperaba al menos 6 <th scope="col"> en /billing, hay ${thCount}`);
});

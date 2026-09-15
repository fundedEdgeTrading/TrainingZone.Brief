import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FEATURE_BY_ROUTE, featureForRoute } from "@/lib/rbac";

/**
 * HU-ST-25 · El gate de plan de la ruta nueva `/billing/contabilidad`.
 *
 * La regla del trimestre es que una ruta nueva sin gate declarado falle EN
 * TEST, no en producción. `FEATURE_BY_ROUTE` vive en `src/lib/rbac.ts`, que
 * está congelado, así que la declaración se pide por escrito y la pantalla
 * aplica la guarda mientras tanto. Este test cierra las dos mitades: si
 * desaparece la petición **y** la ruta sigue sin estar en el mapa, o si la
 * pantalla deja de llamar a la guarda, se pone en rojo.
 */

const PAGE = "src/app/(app)/billing/contabilidad/page.tsx";
const ACTIONS = "src/app/(app)/billing/contabilidad/actions.ts";
const PETICION = "docs/hu/patches-rbac/HU-ST-25-gate-billing-contabilidad.md";
const RUTA = "/billing/contabilidad";

test("HU-ST-25 · la pantalla exige rol de dirección y plan con exportaciones", () => {
  const page = readFileSync(PAGE, "utf8");
  assert.match(page, /requireRole\(\["OWNER", "CENTER_DIRECTOR"\]\)/);
  assert.match(page, /requireFeature\("exportaciones"\)/);

  // La guarda del plan va DESPUÉS del rol y ANTES de leer nada: comprobarla al
  // final habría dejado la consulta hecha antes de decidir si se puede mirar.
  const rol = page.indexOf("requireRole(");
  const plan = page.indexOf('requireFeature("exportaciones")');
  const consulta = page.indexOf("listAccountingMovements(");
  assert.ok(rol < plan && plan < consulta, "el orden de las guardas cambió");
});

test("HU-ST-25 · la descarga vuelve a comprobar rol y plan, no se fía de la pantalla", () => {
  const actions = readFileSync(ACTIONS, "utf8");
  assert.match(actions, /requireRole\(\["OWNER", "CENTER_DIRECTOR"\]\)/);
  assert.match(actions, /orgHasFeatureNow\(session\.user\.orgId, "exportaciones"\)/);
  // Y el rastro: quién se llevó qué periodo y cuándo.
  assert.match(actions, /logAccountingExport\(/);
});

test("HU-ST-25 · el gate está declarado: en el mapa, o en la petición mientras rbac.ts siga congelado", () => {
  const enElMapa = FEATURE_BY_ROUTE[RUTA];
  if (enElMapa) {
    assert.equal(enElMapa, "exportaciones");
    assert.equal(featureForRoute(`${RUTA}/lo-que-sea`), "exportaciones", "la hija hereda (E6-02)");
    assert.equal(
      existsSync(PETICION),
      false,
      `${RUTA} ya está en FEATURE_BY_ROUTE: borra ${PETICION} para no dejar el gate declarado en dos sitios`
    );
    return;
  }

  assert.equal(
    existsSync(PETICION),
    true,
    `${RUTA} no está en FEATURE_BY_ROUTE y tampoco hay petición en ${PETICION}: la ruta se quedaría sin gate declarado`
  );
  const peticion = readFileSync(PETICION, "utf8");
  assert.match(peticion, new RegExp(`"${RUTA}": "exportaciones"`), "la petición tiene que traer el diff exacto");
});

test("HU-ST-25 · el gate se declara en la hija: gatear /billing cerraría Cobros entero", () => {
  assert.equal(
    FEATURE_BY_ROUTE["/billing"],
    undefined,
    "Cobros es la pantalla de trabajo diario de recepción y no puede quedar detrás del muro de pago"
  );
});

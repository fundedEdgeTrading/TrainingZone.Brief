import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEATURE_BY_ROUTE, featureForRoute } from "@/lib/rbac";

/**
 * HU-ST-27 · El gateo por plan y el ámbito de `/billing/cupones`, ruta nueva.
 *
 * El invariante del trimestre dice que una ruta nueva **sin gate declarado debe
 * fallar en test, no en producción**. La decisión tomada aquí es *sin gate*, y
 * queda fijada abajo igual que la de `/audit` (E6-07/D-C7), que es el
 * precedente del repositorio para "esto no se gatea, y no es un olvido":
 *
 *   Cobrar entra en todos los planes —`/billing` no está en `FEATURE_BY_ROUTE`—
 *   y un código de descuento es una forma de cobrar. Gatearlo significaría que
 *   un gimnasio en Esencial no puede hacer una promoción de verano con la
 *   pasarela que ya está pagando, mientras Apta presume de "cero comisión sobre
 *   tus cobros" (E6-05). La medición que trae la pantalla no es BI de panel:
 *   son las ventas de sus propios códigos.
 *
 * La otra mitad del invariante ya está mecanizada y no hace falta repetirla:
 * `rbac-gating.test.ts` (E6-02) recorre TODAS las páginas de `(app)` y exige
 * `requireFeature` a cualquiera que herede un gate. Así que el día que alguien
 * meta `/billing` o `/billing/cupones` en el mapa, CI se pone en rojo hasta que
 * la pantalla llame a la guarda: la ruta no puede quedarse medio gateada.
 *
 * `src/lib/rbac.ts` está **congelado** este trimestre, así que aquí no hay nada
 * que añadirle. Lo que sí queda pedido para la ventana de merge —el título de
 * cabecera de la ruta— está en `docs/hu/patches-rbac/HU-ST-27-billing-cupones.md`.
 */

const PAGE = "src/app/(app)/billing/cupones/page.tsx";
const ACTIONS = "src/app/(app)/billing/cupones/actions.ts";

test("HU-ST-27 · /billing/cupones no se gatea por plan, y es una decisión", () => {
  assert.equal(FEATURE_BY_ROUTE["/billing"], undefined, "cobrar entra en todos los planes");
  assert.equal(FEATURE_BY_ROUTE["/billing/cupones"], undefined);
  assert.equal(featureForRoute("/billing/cupones"), undefined, "no hereda gate porque su padre no lo tiene");
  // Coherente con la decisión: la pantalla no llama a la guarda de plan. Si
  // alguna vez se gatea, este test y el de E6-02 cambian a la vez o CI avisa.
  assert.equal(/requireFeature\(/.test(readFileSync(PAGE, "utf8")), false);
});

test("HU-ST-27 · la pantalla es de dirección y el alta, solo de dirección de organización", () => {
  const page = readFileSync(PAGE, "utf8");
  const roles = page.match(/requireRole\(\[([^\]]+)\]\)/);
  assert.ok(roles, "la pantalla tiene que exigir rol");
  for (const role of ["OWNER", "CENTER_DIRECTOR"]) {
    assert.match(roles[1], new RegExp(`"${role}"`), `falta ${role}`);
  }
  assert.equal(/"RECEPTION"/.test(roles[1]), false, "un código es una decisión comercial, no de mostrador");

  // Un cupón vive en la cuenta de Stripe de la ORGANIZACIÓN y no tiene centro:
  // crearlo o archivarlo afecta a todos los centros a la vez, así que la
  // escritura se reserva a quien manda en toda la organización.
  const actions = readFileSync(ACTIONS, "utf8");
  for (const guard of actions.match(/requireRole\(\[[^\]]+\]\)/g) ?? []) {
    assert.equal(guard, 'requireRole(["OWNER"])', `acción de cupones abierta de más: ${guard}`);
  }
});

test("HU-ST-27 · la medición pasa por el ámbito de centro", () => {
  const page = readFileSync(PAGE, "utf8");
  assert.match(page, /centerScopeFor\(session\.user\)/, "la pantalla tiene que resolver el ámbito");
  assert.match(page, /getCouponPerformance\(session\.user\.orgId, \{ centerIds/, "y pasárselo a la medición");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BARRIO_STATE_FILTERS,
  DEFAULT_BARRIO_PARAMS,
  barrioMapHref,
  barrioMapQuery,
  parseBarrioMapParams,
} from "@/lib/barrio-map-params";

/**
 * E11-07 · `/mapa-barrios` ni leía `searchParams`. El mapa era siempre acumulado
 * histórico —no comparable con el resto del panel, y con los mismos rótulos— y
 * su estado no era enlazable ni compartible, a diferencia de `/dashboard`, cuyo
 * estado vive en la URL por decisión explícita.
 */

test("acepta los cinco parámetros", () => {
  const params = parseBarrioMapParams({
    ciudad: "santander",
    metrica: "opp",
    range: "trim",
    estado: "todos",
    centerId: "ctr_1",
  });
  assert.deepEqual(params, {
    ciudad: "santander",
    metrica: "opp",
    range: "trim",
    estado: "todos",
    centerId: "ctr_1",
  });
});

test("lo que no se reconoce cae al valor por defecto, no revienta", () => {
  // Una URL compartida por WhatsApp llega con lo que llega, y una pantalla de
  // dirección que devuelve un 500 por un parámetro mal escrito es peor que una
  // que enseña el mapa por defecto.
  const params = parseBarrioMapParams({ metrica: "inventada", range: "siempre", estado: "vivos" });
  assert.equal(params.metrica, DEFAULT_BARRIO_PARAMS.metrica);
  assert.equal(params.range, DEFAULT_BARRIO_PARAMS.range);
  assert.equal(params.estado, DEFAULT_BARRIO_PARAMS.estado);
  assert.equal(params.ciudad, null);
  assert.equal(params.centerId, null);
});

test("un parámetro repetido se queda con el primero", () => {
  assert.equal(parseBarrioMapParams({ metrica: ["conv", "opp"] }).metrica, "conv");
});

test("la URL solo lleva lo que se ha cambiado a mano", () => {
  // Así `/mapa-barrios?metrica=conv` se lee de un vistazo, en vez de arrastrar
  // cinco parámetros que valen su defecto.
  assert.equal(barrioMapQuery(DEFAULT_BARRIO_PARAMS), "");
  assert.equal(barrioMapHref({}), "/mapa-barrios");
  assert.equal(barrioMapHref({ metrica: "conv" }), "/mapa-barrios?metrica=conv");
});

test("la URL se puede copiar y reproduce la misma vista", () => {
  const original = parseBarrioMapParams({
    ciudad: "zaragoza",
    metrica: "trend",
    range: "ano",
    estado: "bajas",
    centerId: "ctr_9",
  });
  const compartida = Object.fromEntries(new URLSearchParams(barrioMapQuery(original)));
  assert.deepEqual(parseBarrioMapParams(compartida), original);
});

test("los tres estados son los que necesitan E11-01 y E11-09", () => {
  assert.deepEqual([...BARRIO_STATE_FILTERS], ["activos", "todos", "bajas"]);
  // Por defecto, socios vivos: un barrio con fuga masiva no puede seguir
  // pintándose oscuro.
  assert.equal(DEFAULT_BARRIO_PARAMS.estado, "activos");
});

test("el enlace del panel encadena su rango, y conserva prefetch={false}", () => {
  assert.equal(barrioMapHref({ range: "trim", centerId: "ctr_1" }), "/mapa-barrios?range=trim&centerId=ctr_1");

  const panel = readFileSync("src/app/(app)/dashboard/postal-map-panel.tsx", "utf8");
  assert.match(panel, /href=\{barrioMapHref\(\{ range, centerId \}\)\}/);
  // El prefetch de esta ruta compite con la navegación real y puede dejar el
  // `main` vacío: es un fallo ya reproducido en los e2e.
  assert.match(panel, /prefetch=\{false\}/);
});

test("el centerId se lee pero NO se valida aquí: eso es un permiso, y va contra la sesión", () => {
  assert.equal(parseBarrioMapParams({ centerId: "el-de-otro" }).centerId, "el-de-otro");

  // La pantalla lo cruza contra `center-scope.ts` antes de que llegue a ninguna
  // consulta: un `?centerId=` a mano nunca amplía lo que se ve.
  const page = readFileSync("src/app/(app)/mapa-barrios/page.tsx", "utf8");
  assert.match(page, /isCenterInScope\(session\.user, params\.centerId\)/);
});

/**
 * Estado de `/mapa-barrios` en la URL (E11-07).
 *
 * `getPostalCodeMapData` **recibe el rango y nunca lo usa**, y la pantalla ni
 * siquiera leía `searchParams`. Dos consecuencias:
 *
 *  · El mapa era siempre acumulado histórico, así que **no era comparable con el
 *    resto del panel**: dirección miraba "leads de este trimestre" en
 *    `/dashboard` y "leads desde siempre" en el plano, con los mismos rótulos.
 *  · Su estado no era enlazable ni compartible, a diferencia de `/dashboard`,
 *    cuyo estado vive en la URL por decisión explícita. "Mírame Delicias en
 *    conversión" era una instrucción de tres pasos por teléfono.
 *
 * Módulo puro: lo comparten el servidor (que lee `searchParams`) y la vista de
 * cliente (que la reescribe al cambiar de pastilla).
 */

import { BARRIO_METRICS, type BarrioMetric } from "@/lib/barrio-map";
import type { MemberState } from "@prisma/client";

import { parseRange, type DashboardRange } from "@/lib/dashboard-range";

/**
 * Estados de socio que puede pedir el mapa.
 *
 *  · `activos` — el criterio por defecto de E11-01: fuera cancelados y
 *    prospectos, porque un barrio con fuga masiva no puede seguir pintándose
 *    oscuro.
 *  · `todos` — el comportamiento histórico, para conciliar con un export.
 *  · `bajas` — solo cancelados; es lo que necesita la métrica de fuga (E11-09).
 */
export const BARRIO_STATE_FILTERS = ["activos", "todos", "bajas"] as const;
export type BarrioStateFilter = (typeof BARRIO_STATE_FILTERS)[number];

export const BARRIO_STATE_LABEL: Record<BarrioStateFilter, string> = {
  activos: "Socios vivos",
  todos: "Todos los estados",
  bajas: "Solo bajas",
};

/**
 * E14-10 · Qué se lee en primer plano.
 *
 *  · `mapa` — el plano de coropletas, con la tabla en su panel lateral.
 *  · `tabla` — la tabla de códigos postales a pantalla completa, con el plano
 *    recogido. Negocio pidió «una tabla de CP con nº de clientes, nº de leads y
 *    conversión» sin saber que esa tabla ya existía: era la vía accesible del
 *    mapa (E11-04), no una vista con entidad propia. Se encuentra o no existe.
 */
export const BARRIO_VIEWS = ["mapa", "tabla"] as const;
export type BarrioView = (typeof BARRIO_VIEWS)[number];

export const BARRIO_VIEW_LABEL: Record<BarrioView, string> = {
  mapa: "Mapa",
  tabla: "Tabla",
};

export type BarrioMapParams = {
  /** Clave de ciudad del selector. `null` = la primera con datos. */
  ciudad: string | null;
  /** E14-10 · Vista principal. Viaja en la URL como el resto del estado de la pantalla. */
  vista: BarrioView;
  metrica: BarrioMetric;
  range: DashboardRange;
  estado: BarrioStateFilter;
  /** Centro del selector del panel. `null` = todo el ámbito de quien mira. */
  centerId: string | null;
};

export const DEFAULT_BARRIO_PARAMS: BarrioMapParams = {
  ciudad: null,
  vista: "mapa",
  metrica: "members",
  range: "mes",
  estado: "activos",
  centerId: null,
};

function parseMetric(value: string | undefined): BarrioMetric {
  return BARRIO_METRICS.some((m) => m.key === value) ? (value as BarrioMetric) : DEFAULT_BARRIO_PARAMS.metrica;
}

function parseView(value: string | undefined): BarrioView {
  return BARRIO_VIEWS.includes(value as BarrioView) ? (value as BarrioView) : DEFAULT_BARRIO_PARAMS.vista;
}

function parseState(value: string | undefined): BarrioStateFilter {
  return BARRIO_STATE_FILTERS.includes(value as BarrioStateFilter)
    ? (value as BarrioStateFilter)
    : DEFAULT_BARRIO_PARAMS.estado;
}

/**
 * Lee los seis parámetros. Todo lo que no reconoce cae al valor por defecto en
 * vez de romper: una URL compartida por WhatsApp llega con lo que llega, y una
 * pantalla de dirección que devuelve un 500 por un parámetro mal escrito es peor
 * que una que enseña el mapa por defecto.
 *
 * `centerId` se devuelve tal cual y **sin validar**: quién puede mirar qué centro
 * lo decide `center-scope.ts` en el servidor, contra la sesión. Un módulo puro no
 * puede resolver un permiso, y fingir que sí es cómo se cuelan los ámbitos.
 */
export function parseBarrioMapParams(query: Record<string, string | string[] | undefined>): BarrioMapParams {
  const one = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    ciudad: one("ciudad")?.trim() || null,
    vista: parseView(one("vista")),
    metrica: parseMetric(one("metrica")),
    range: parseRange(one("range")),
    estado: parseState(one("estado")),
    centerId: one("centerId")?.trim() || null,
  };
}

/**
 * Escribe los parámetros de vuelta, omitiendo los que valen su defecto: así la
 * URL que se comparte dice solo lo que se ha cambiado a mano, y
 * `/mapa-barrios?metrica=conv` se lee de un vistazo.
 */
export function barrioMapQuery(params: BarrioMapParams): string {
  const search = new URLSearchParams();
  if (params.ciudad) search.set("ciudad", params.ciudad);
  if (params.vista !== DEFAULT_BARRIO_PARAMS.vista) search.set("vista", params.vista);
  if (params.metrica !== DEFAULT_BARRIO_PARAMS.metrica) search.set("metrica", params.metrica);
  if (params.range !== DEFAULT_BARRIO_PARAMS.range) search.set("range", params.range);
  if (params.estado !== DEFAULT_BARRIO_PARAMS.estado) search.set("estado", params.estado);
  if (params.centerId) search.set("centerId", params.centerId);
  return search.toString();
}

/** La URL del mapa con el estado del panel encadenado (el enlace de `/dashboard`). */
export function barrioMapHref(params: Partial<BarrioMapParams>): string {
  const query = barrioMapQuery({ ...DEFAULT_BARRIO_PARAMS, ...params });
  return query ? `/mapa-barrios?${query}` : "/mapa-barrios";
}

/**
 * E11-01 · El filtro de la URL, traducido a estados de `Member`.
 *
 *  · `activos` — fuera `CANCELLED` y `PROSPECT`. Un cancelado no es un socio y
 *    un prospecto todavía no lo es: contarlos hace que un barrio con fuga masiva
 *    se siga pintando oscuro, que es justo al revés de lo que hay que ver.
 *  · `todos` — el comportamiento histórico, para poder conciliar con un export.
 *  · `bajas` — solo cancelados, que es lo que mide la métrica de fuga (E11-09).
 */
export function memberStatesFor(filter: BarrioStateFilter): MemberState[] {
  const live: MemberState[] = ["TRIAL", "ACTIVE", "DELINQUENT", "FROZEN"];
  if (filter === "todos") return [...live, "CANCELLED", "PROSPECT"];
  if (filter === "bajas") return ["CANCELLED"];
  return live;
}

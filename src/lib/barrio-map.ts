// Lectura del mapa de barrios (/mapa-barrios): métricas, rampas de color y
// agrupación por ciudad. Módulo puro (sin Prisma ni DOM): lo comparten la
// consulta del servidor, la vista de cliente y el propio mapa de Leaflet, así
// que el color de una celda, el testigo de su fila en el ranking y el escalón
// de la leyenda no pueden discrepar.

import { postalCityLabel, POSTAL_CODE_CITIES } from "@/lib/postal-codes";

export type BarrioMetric = "members" | "leads" | "conv" | "trend" | "dist" | "opp";

/** Lo que `getPostalCodeStats()` devuelve por barrio, ya con los derivados. */
export type BarrioStat = {
  code: string;
  name: string;
  lat: number;
  lng: number;
  leads: number;
  members: number;
  total: number;
  /** % de la demanda del barrio ya convertida en cliente. */
  conv: number;
  /** % de variación de altas de los últimos 90 días frente a los 90 anteriores. */
  trend: number;
  /** km en línea recta al centro más cercano de la organización (1 decimal). */
  dist: number;
  /** Índice de oportunidad: demanda que existe pero queda lejos de un centro. */
  opp: number;
  /** Nombre del centro más cercano; null si la organización no tiene ninguno situado. */
  nearestCenter: string | null;
};

export type BarrioCenter = { id: string; name: string; lat: number; lng: number };

export type BarrioCity = {
  /** Clave estable para el selector y para reconstruir la geometría al cambiar. */
  key: string;
  label: string;
  points: BarrioStat[];
  centers: BarrioCenter[];
};

export type BarrioMetricDef = {
  key: BarrioMetric;
  label: string;
  /** La pregunta de dirección que responde la métrica; es la píldora bajo la barra. */
  question: string;
  /** Nota corta de la leyenda: cómo se lee la rampa. */
  note: string;
  suffix: string;
};

/** Las seis preguntas que dirección pidió poder contestar sobre el plano. */
export const BARRIO_METRICS: BarrioMetricDef[] = [
  { key: "members", label: "Clientes", question: "¿Dónde están mis clientes?", note: "+ intenso, + clientes", suffix: "" },
  { key: "leads", label: "Leads", question: "¿Dónde hay leads sin convertir?", note: "+ intenso, + leads", suffix: "" },
  { key: "conv", label: "Conversión", question: "¿Dónde convierto peor?", note: "terracota = peor", suffix: "%" },
  { key: "trend", label: "Tendencia", question: "¿Qué barrio crece y cuál se apaga?", note: "verde sube · terracota cae", suffix: "%" },
  { key: "dist", label: "Distancia", question: "¿A qué distancia queda el centro más cercano?", note: "terracota = más lejos", suffix: " km" },
  { key: "opp", label: "Oportunidad", question: "¿Dónde abrir el próximo centro?", note: "terracota = más margen", suffix: "" },
];

export function metricDef(metric: BarrioMetric): BarrioMetricDef {
  return BARRIO_METRICS.find((m) => m.key === metric) ?? BARRIO_METRICS[0];
}

/**
 * Rampa secuencial (hueso → oro de marca → terracota). Anclada en dos tokens
 * que ya existen (`--color-apta-gold` en el centro, `--color-critical` al
 * final); los intermedios interpolan. Va como literal y no como token porque
 * son datos de una escala, no superficie de UI: el mismo color tiene que salir
 * en el relleno del polígono (SVG de Leaflet, fuera de React) y en el testigo
 * de la fila.
 */
export const SEQUENTIAL_RAMP = ["#f2eee4", "#e4dac6", "#d5c19b", "#c8ab72", "#b5834b", "#9c5c30", "#8a3420"];

/** Rampa divergente de Tendencia: terracota crítico → hueso neutro → verde `good`. */
export const DIVERGING_RAMP = ["#8a3420", "#ad6844", "#d0a578", "#ece5d6", "#a8b57e", "#7a8c42", "#4b5a22"];

/** Tinta legible cuando el valor cae en el escalón más claro de la rampa. */
export const RAMP_FALLBACK_INK = "#1d1d1c";

/**
 * Color con el que escribir una cifra grande sobre fondo claro. La cifra de la
 * tarjeta de foco se tiñe con el color de celda del barrio para atar tarjeta y
 * mapa; en el escalón más claro de cada rampa eso deja el número casi en
 * blanco, así que ahí se cae a la tinta de marca.
 */
export function readableMetricInk(color: string): string {
  return color === SEQUENTIAL_RAMP[0] || color === DIVERGING_RAMP[3] ? RAMP_FALLBACK_INK : color;
}

export type BarrioScale = {
  kind: "seq" | "div";
  min: number;
  max: number;
  /** La rampa se lee al revés: en Conversión el terracota es el problema. */
  inverted: boolean;
};

export function metricValue(point: BarrioStat, metric: BarrioMetric): number {
  return point[metric];
}

/**
 * Extremos de la métrica en la ciudad activa (no globales): al cambiar de
 * ciudad la rampa se reescala y la leyenda lo refleja. Tendencia se mapea sobre
 * `[-max|v|, +max|v|]` para que el escalón central sea siempre el cero.
 */
export function metricScale(points: BarrioStat[], metric: BarrioMetric): BarrioScale {
  const values = points.map((p) => metricValue(p, metric));
  if (values.length === 0) return { kind: metric === "trend" ? "div" : "seq", min: 0, max: 0, inverted: false };
  if (metric === "trend") {
    const bound = Math.max(1, ...values.map(Math.abs));
    return { kind: "div", min: -bound, max: bound, inverted: false };
  }
  return { kind: "seq", min: Math.min(...values), max: Math.max(...values), inverted: metric === "conv" };
}

/** Los 7 escalones tal y como se pintan en la leyenda (ya invertidos si toca). */
export function rampForScale(scale: BarrioScale): string[] {
  if (scale.kind === "div") return DIVERGING_RAMP;
  return scale.inverted ? [...SEQUENTIAL_RAMP].reverse() : SEQUENTIAL_RAMP;
}

export function colorForValue(value: number, scale: BarrioScale): string {
  const span = scale.max - scale.min || 1;
  let t = (value - scale.min) / span;
  if (scale.kind === "seq" && scale.inverted) t = 1 - t;
  const ramp = scale.kind === "div" ? DIVERGING_RAMP : SEQUENTIAL_RAMP;
  return ramp[Math.min(6, Math.max(0, Math.round(t * 6)))];
}

/** Color de cada barrio para la métrica activa, indexado por CP. */
export function colorsByCode(points: BarrioStat[], metric: BarrioMetric): Record<string, string> {
  const scale = metricScale(points, metric);
  return Object.fromEntries(points.map((p) => [p.code, colorForValue(metricValue(p, metric), scale)]));
}

export function formatMetricValue(value: number, metric: BarrioMetric): string {
  const def = metricDef(metric);
  const rounded = Math.round(value * 10) / 10;
  const sign = metric === "trend" && rounded > 0 ? "+" : "";
  return `${sign}${rounded}${def.suffix}`;
}

/**
 * Ranking descendente, salvo en Conversión: la pregunta es «dónde convierto
 * peor», así que lo primero de la lista tiene que ser el problema.
 */
export function sortByMetric(points: BarrioStat[], metric: BarrioMetric): BarrioStat[] {
  const direction = metric === "conv" ? -1 : 1;
  return [...points].sort((a, b) => direction * (metricValue(b, metric) - metricValue(a, metric)));
}

/** Orden de colocación de etiquetas: primero el barrio con más peso en la métrica. */
export function labelPriority(points: BarrioStat[], metric: BarrioMetric): string[] {
  return [...points]
    .sort((a, b) => Math.abs(metricValue(b, metric)) - Math.abs(metricValue(a, metric)))
    .map((p) => p.code);
}

/**
 * Reparte barrios y centros por ciudad.
 *
 * Solo salen las ciudades con algún dato (un barrio con clientes o leads), pero
 * de esas se conservan TODOS sus barrios: la teselación necesita el juego
 * completo de puntos para partir la ciudad entera, y un barrio a cero es
 * justamente lo que responde «¿dónde abrir el próximo centro?».
 *
 * Cada centro se adscribe a la ciudad de su barrio más cercano. La distancia
 * por barrio (`dist`), en cambio, se calcula contra todos los centros de la
 * organización: el centro más cercano a un barrio de Zaragoza es de Zaragoza,
 * y si no lo hubiera, la cifra honesta es la del que sí exista.
 */
export function groupBarriosByCity(points: BarrioStat[], centers: BarrioCenter[]): BarrioCity[] {
  const byCity = new Map<string, BarrioStat[]>();
  for (const point of points) {
    const city = postalCityLabel(point.code) ?? "Otras zonas";
    const bucket = byCity.get(city);
    if (bucket) bucket.push(point);
    else byCity.set(city, [point]);
  }

  const cities = [...byCity.entries()]
    .filter(([, cityPoints]) => cityPoints.some((p) => p.total > 0))
    .map(([label, cityPoints]) => ({ key: slugKey(label), label, points: cityPoints, centers: [] as BarrioCenter[] }));

  for (const center of centers) {
    let best: { city: (typeof cities)[number]; km: number } | null = null;
    for (const city of cities) {
      for (const point of city.points) {
        const km = Math.hypot(point.lat - center.lat, point.lng - center.lng);
        if (!best || km < best.km) best = { city, km };
      }
    }
    best?.city.centers.push(center);
  }

  // Orden: primero las ciudades con detalle de barrio, en el orden en que se
  // declaran en `postal-codes.ts` (Zaragoza antes que Santander, que es como lo
  // lee dirección); detrás, lo que haya caído por la degradación a provincia.
  return cities.sort((a, b) => cityRank(a.label) - cityRank(b.label) || a.label.localeCompare(b.label, "es"));
}

function cityRank(label: string): number {
  const index = POSTAL_CODE_CITIES.indexOf(label);
  return index === -1 ? POSTAL_CODE_CITIES.length : index;
}

function slugKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

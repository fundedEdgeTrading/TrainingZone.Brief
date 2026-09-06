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
  /**
   * km en línea recta al centro más cercano de la organización (1 decimal).
   *
   * ⚠️ La agregación devuelve 0 cuando no hay ningún centro situado, que es un
   * cero INVENTADO: no significa "está en la puerta", significa "no se puede
   * calcular". No se lee este campo directamente — se lee con `metricValue`,
   * que devuelve `null` en ese caso (E11-03).
   */
  dist: number;
  /** Índice de oportunidad. Mismo cero inventado que `dist`, y misma regla: leerlo con `metricValue`. */
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

/**
 * Rampa divergente de Tendencia: terracota crítico → hueso neutro → verde `good`.
 *
 * E11-06 · **Rehecha.** La anterior era simétrica también en claridad: los pares
 * (0,6), (1,5) y (2,4) tenían ΔL\* de 1,9 · 4,4 · **0,8**, así que lo único que
 * separaba "cae un 40 %" de "sube un 40 %" era el eje rojo-verde — exactamente
 * el que pierde el ~8 % de los hombres. Para un protanope el mapa de Tendencia
 * era una mancha uniforme.
 *
 * Ahora la claridad lleva el signo: el brazo negativo es sistemáticamente más
 * oscuro que su simétrico positivo, con ΔL\* de 26,4 · 23,1 · 16,4. Un ojo que
 * no distingue rojo de verde sigue viendo "oscuro = cae, claro = sube". La
 * redundancia no cromática la completa el trazo discontinuo de los negativos
 * (ver `dashedByCode`).
 */
export const DIVERGING_RAMP = ["#7b2e1c", "#a5583a", "#c99b78", "#ece5d6", "#cbd79b", "#9cb254", "#7a9038"];

/**
 * Tinta legible cuando el valor cae en el escalón más claro de la rampa.
 *
 * E11-06 · Deja de ser un literal. Sobre la tarjeta OSCURA, `#1d1d1c` daba
 * 1,07:1 — invisible. Es una superficie de UI, no un dato: le toca el token, que
 * ya es hueso en tema oscuro y tinta en claro.
 */
export const RAMP_FALLBACK_INK = "var(--color-brand-text)";

/**
 * Color con el que escribir una cifra grande sobre fondo claro. La cifra de la
 * tarjeta de foco se tiñe con el color de celda del barrio para atar tarjeta y
 * mapa; en el escalón más claro de cada rampa eso deja el número casi en
 * blanco, así que ahí se cae a la tinta de marca.
 */
export function readableMetricInk(color: string): string {
  return color === SEQUENTIAL_RAMP[0] || color === DIVERGING_RAMP[3] ? RAMP_FALLBACK_INK : color;
}

// --- Contraste (E11-06) ------------------------------------------------------
//
// Estas dos tintas SÍ son literales, y a diferencia de `RAMP_FALLBACK_INK` tienen
// que serlo: se escriben ENCIMA de la rampa de datos, que es fija y no cambia con
// el tema. Un rótulo que se volviera hueso en modo oscuro desaparecería sobre el
// escalón más claro, que sigue siendo hueso en los dos temas.

/** Tinta oscura para los escalones claros de la rampa. */
export const INK_DARK = "#1d1d1c";
/** Tinta hueso para los escalones oscuros. */
export const INK_BONE = "#f7f4ed";

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa WCAG de un `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => channelLuminance(parseInt(value.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores, de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Claridad CIE L\* (0 negro, 100 blanco). Es la que decide si dos colores se distinguen sin ver el matiz. */
export function lightness(hex: string): number {
  const y = relativeLuminance(hex);
  return y <= 216 / 24389 ? (y * 24389) / 27 : Math.cbrt(y) * 116 - 16;
}

/**
 * E11-06 · Tinta del rótulo sobre una celda, elegida por contraste y no por
 * costumbre.
 *
 * Las etiquetas del mapa se pintaban con tinta FIJA: sobre el escalón 6 el
 * nombre daba 2,08:1 y la cifra 1,12:1 — ilegible. Y lo llamativo es que
 * `readableMetricInk()` ya resolvía este problema, pero solo se usaba en la
 * tarjeta de foco.
 */
export function readableInkOn(fill: string): string {
  return contrastRatio(fill, INK_DARK) >= contrastRatio(fill, INK_BONE) ? INK_DARK : INK_BONE;
}

/** El halo del rótulo es la tinta contraria: es la superficie sobre la que se lee de verdad. */
export function haloForInk(ink: string): string {
  return ink === INK_DARK ? INK_BONE : INK_DARK;
}

/** Cuántos escalones tiene la rampa. Es el largo de las dos rampas de arriba. */
export const CLASS_COUNT = 7;

/**
 * Cómo se reparten los valores entre los siete escalones.
 *
 *  · `quantile` — mismo NÚMERO de barrios por escalón. Es lo que hace falta en
 *    distribuciones sesgadas: un barrio dominante ya no achata el resto.
 *  · `equal` — mismo ANCHO de valor por escalón. Correcto cuando la métrica ya
 *    está acotada por construcción (un porcentaje, unos kilómetros).
 *  · `diverging` — ancho igual pero simétrico alrededor del cero, para que el
 *    escalón central sea siempre "sin cambio".
 */
export type ClassificationKind = "quantile" | "equal" | "diverging";

export type BarrioClassification = {
  kind: ClassificationKind;
  /** Los SEIS cortes que separan los siete escalones, ascendentes. */
  breaks: number[];
  /** Los siete colores, ya invertidos si la métrica se lee al revés. */
  ramp: string[];
  /** En Conversión el terracota es el problema, no el récord. */
  inverted: boolean;
  min: number;
  max: number;
};

/**
 * Qué clasificación le toca a cada métrica.
 *
 * Con el reparto medido en el informe —escalón 0 con 11 barrios, escalón 1 con
 * 6, escalón 2 con 1, escalones 3-5 VACÍOS y escalón 6 con 1— el mapa no está
 * midiendo: está diciendo "hay un barrio grande y luego está todo lo demás". Es
 * el problema clásico del intervalo igual sobre una distribución sesgada, y lo
 * resuelven los cuantiles.
 *
 * Conversión y distancia se quedan en intervalo igual **a propósito**: ya están
 * acotadas (un porcentaje es 0-100, la distancia no tiene cola larga a escala de
 * ciudad) y ahí el cuantil exageraría diferencias de décimas.
 */
export function classificationKind(metric: BarrioMetric): ClassificationKind {
  if (metric === "trend") return "diverging";
  if (metric === "conv" || metric === "dist") return "equal";
  return "quantile";
}

/**
 * Relleno de un barrio del que no se puede calcular la métrica (E11-03).
 *
 * Gris neutro y fuera de las dos rampas a propósito: tiene que ser
 * inconfundible con cualquier escalón, porque significa otra cosa. Un barrio sin
 * dato pintado del color del escalón 0 dice "aquí no pasa nada", y lo que pasa
 * es que no lo sabemos.
 */
export const NO_DATA_FILL = "#cfcabd";

/**
 * Valor de la métrica, o `null` si no se puede calcular (E11-03).
 *
 * `dist` y `opp` dependen de que la organización tenga algún centro SITUADO
 * (`Center.lat/lng` son opcionales). Cuando no lo hay, la agregación devuelve 0
 * y el mapa pintaba la ciudad entera a 0,0 km: la tarjeta de foco lo advertía,
 * pero el mapa, la leyenda y el ranking, no. **Una decisión de inversión tomada
 * sobre un cero inventado es peor que no tener el mapa.**
 *
 * `nearestCenter === null` es la señal fiable: es lo que la agregación pone
 * cuando no encuentra ningún centro contra el que medir.
 */
export function metricValue(point: BarrioStat, metric: BarrioMetric): number | null {
  if ((metric === "dist" || metric === "opp") && point.nearestCenter === null) return null;
  return point[metric];
}

/** `true` si la métrica se puede calcular en esta ciudad. Es lo que deshabilita su pastilla. */
export function metricAvailable(points: BarrioStat[], metric: BarrioMetric): boolean {
  if (metric !== "dist" && metric !== "opp") return true;
  return points.some((p) => p.nearestCenter !== null);
}

/** `true` si algún barrio se queda sin dato: entonces la leyenda necesita su entrada de gris. */
export function hasMissingValues(points: BarrioStat[], metric: BarrioMetric): boolean {
  return points.some((p) => metricValue(p, metric) === null);
}

/**
 * Los cortes de una serie de valores. Función pura y sin métricas dentro: se
 * puede probar con números sueltos.
 *
 * `quantile` reparte por posición en la serie ordenada; los empates hacen que el
 * reparto no sea exactamente igual y eso es correcto — dos barrios con el mismo
 * valor tienen que caer en el mismo escalón, aunque desequilibre el recuento.
 */
export function classify(values: number[], kind: ClassificationKind, classes = CLASS_COUNT): number[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0 || classes < 2) return [];

  if (kind === "diverging") {
    // Simétrica alrededor del cero pase lo que pase: el escalón central es "sin
    // cambio", y si dependiera de los extremos observados un barrio que cae un
    // 40 % movería el cero de sitio.
    const bound = Math.max(1, ...finite.map(Math.abs));
    return equalBreaks(-bound, bound, classes);
  }

  if (kind === "equal") {
    return equalBreaks(Math.min(...finite), Math.max(...finite), classes);
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    breaks.push(sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / classes))]);
  }
  return breaks;
}

function equalBreaks(min: number, max: number, classes: number): number[] {
  const step = (max - min) / classes;
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) breaks.push(min + step * i);
  return breaks;
}

/** La clasificación completa de una métrica sobre la ciudad activa. */
export function classifyMetric(points: BarrioStat[], metric: BarrioMetric): BarrioClassification {
  const kind = classificationKind(metric);
  // Los barrios sin dato no entran en el reparto: si contaran, un montón de
  // ceros inventados desplazaría todos los cortes hacia abajo.
  const values = points
    .map((p) => metricValue(p, metric))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const inverted = metric === "conv";
  const base = kind === "diverging" ? DIVERGING_RAMP : SEQUENTIAL_RAMP;

  return {
    kind,
    breaks: classify(values, kind),
    ramp: inverted ? [...base].reverse() : base,
    inverted,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}

/**
 * A qué escalón (0-6) cae un valor. El escalón se cuenta SIEMPRE de menor a
 * mayor; la inversión de Conversión vive en el orden de la rampa, no aquí, para
 * que la leyenda y el mapa no puedan discrepar.
 */
export function classIndex(value: number, classification: BarrioClassification): number {
  const { breaks } = classification;
  if (breaks.length === 0) return 0;
  let index = 0;
  while (index < breaks.length && value >= breaks[index]) index++;
  return Math.min(index, classification.ramp.length - 1);
}

export function colorForValueClassified(value: number | null, classification: BarrioClassification): string {
  if (value === null) return NO_DATA_FILL;
  return classification.ramp[classIndex(value, classification)];
}

/** Un escalón de la leyenda: su color y el tramo de valores que representa. */
export type LegendStep = {
  color: string;
  /** `null` en el primero: no hay cota inferior más allá del mínimo observado. */
  from: number;
  to: number | null;
};

/**
 * Los siete escalones con sus cortes.
 *
 * La leyenda anterior enseñaba dos etiquetas, mínimo y máximo, y eso solo es
 * honesto con intervalo igual. **Con cuantiles los escalones no son
 * equidistantes**: una leyenda de dos extremos le haría creer a quien la lee que
 * el color del medio es el valor del medio, que es exactamente lo contrario de
 * lo que pasa en una distribución sesgada.
 */
export function legendSteps(classification: BarrioClassification): LegendStep[] {
  const { breaks, ramp, min, max } = classification;
  if (breaks.length === 0) return ramp.map((color) => ({ color, from: min, to: max }));

  const lower = [classification.kind === "diverging" ? -Math.max(...breaks.map(Math.abs), 0) : min, ...breaks];
  return ramp.map((color, i) => ({
    color,
    from: lower[i],
    to: i < breaks.length ? breaks[i] : null,
  }));
}

/** Color de cada barrio para la métrica activa, indexado por CP. */
export function colorsByCode(points: BarrioStat[], metric: BarrioMetric): Record<string, string> {
  const classification = classifyMetric(points, metric);
  return Object.fromEntries(
    points.map((p) => [p.code, colorForValueClassified(metricValue(p, metric), classification)])
  );
}

/** Tinta de cada rótulo, indexada por CP. Sale del MISMO relleno que pinta la celda. */
export function inksByCode(colors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(colors).map(([code, fill]) => [code, readableInkOn(fill)]));
}

/**
 * E11-06 · Qué barrios llevan trazo discontinuo: los que CAEN.
 *
 * Es la redundancia no cromática de la métrica divergente. La claridad ya lleva
 * el signo, pero un patrón distinto lo dice sin depender de ver nada: en una
 * captura en blanco y negro, o para quien tiene acromatopsia, sigue siendo
 * legible.
 */
export function dashedByCode(points: BarrioStat[], metric: BarrioMetric): Record<string, boolean> {
  if (classificationKind(metric) !== "diverging") return {};
  return Object.fromEntries(points.map((p) => [p.code, (metricValue(p, metric) ?? 0) < 0]));
}

export function formatMetricValue(value: number | null, metric: BarrioMetric): string {
  // Una raya, no un cero: el cero es un valor y esto es la ausencia de uno.
  if (value === null) return "—";
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
  // Los barrios sin dato caen al final en cualquier orden: no son ni el mejor ni
  // el peor, y colarlos entre los ceros sería volver a inventarles un valor.
  return [...points].sort((a, b) => {
    const va = metricValue(a, metric);
    const vb = metricValue(b, metric);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direction * (vb - va);
  });
}

/** Orden de colocación de etiquetas: primero el barrio con más peso en la métrica. */
export function labelPriority(points: BarrioStat[], metric: BarrioMetric): string[] {
  return [...points]
    .sort((a, b) => Math.abs(metricValue(b, metric) ?? 0) - Math.abs(metricValue(a, metric) ?? 0))
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

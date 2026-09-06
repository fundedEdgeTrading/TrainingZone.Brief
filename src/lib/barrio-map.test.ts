import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_COUNT,
  DIVERGING_RAMP,
  NO_DATA_FILL,
  SEQUENTIAL_RAMP,
  classIndex,
  classificationKind,
  classify,
  classifyMetric,
  colorForValueClassified,
  colorsByCode,
  formatMetricValue,
  groupBarriosByCity,
  hasMissingValues,
  legendSteps,
  metricAvailable,
  metricValue,
  readableMetricInk,
  sortByMetric,
  type BarrioStat,
} from "./barrio-map";

// Lo que se comprueba aquí es la lectura del mapa, no su aspecto: que la escala
// REPARTA los barrios en vez de amontonarlos en el primer escalón, que la rampa
// se invierta donde el peor valor es el más oscuro (Conversión), que Tendencia
// tenga el cero en el escalón central pase lo que pase, y que el ranking ponga
// primero el problema y no el récord.

function barrio(over: Partial<BarrioStat> & { code: string }): BarrioStat {
  return {
    name: over.name ?? `Barrio ${over.code}`,
    lat: 41.65,
    lng: -0.88,
    leads: 0,
    members: 0,
    total: 0,
    conv: 0,
    trend: 0,
    dist: 0,
    opp: 0,
    nearestCenter: null,
    ...over,
  };
}

const CITY = [
  barrio({ code: "50001", members: 10, leads: 5, total: 15, conv: 67, trend: 20, dist: 0.4, opp: 1.1 }),
  barrio({ code: "50005", members: 30, leads: 20, total: 50, conv: 60, trend: -40, dist: 1.8, opp: 5.2 }),
  barrio({ code: "50019", members: 2, leads: 18, total: 20, conv: 10, trend: 0, dist: 4.2, opp: 18.7 }),
];

/**
 * E11-02 · La distribución sesgada del informe: muchos barrios pequeños y uno
 * dominante. Con intervalo igual el reparto medido era 11/6/1/0/0/0/1 — tres
 * escalones VACÍOS y el mapa diciendo "hay un barrio grande y luego está todo lo
 * demás" en vez de midiendo.
 */
const SKEWED = [0, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 11, 13, 15, 18, 22, 27, 34, 120];

/** Cuántos valores caen en cada uno de los siete escalones. */
function spread(values: number[], kind: Parameters<typeof classify>[1]): number[] {
  const breaks = classify(values, kind);
  const counts = new Array(CLASS_COUNT).fill(0);
  const fake = { kind, breaks, ramp: SEQUENTIAL_RAMP, inverted: false, min: 0, max: 0 } as const;
  for (const value of values) counts[classIndex(value, fake)]++;
  return counts;
}

test("E11-02 · con intervalo igual, un barrio dominante achata la escala entera", () => {
  const counts = spread(SKEWED, "equal");
  // El diagnóstico del informe, reproducido: sale 14/4/0/0/0/0/1 — cuatro
  // escalones sin un solo barrio y catorce amontonados en el primero. El mapa no
  // está midiendo, está diciendo "hay un barrio grande y luego está todo lo
  // demás".
  assert.deepEqual(counts, [14, 4, 0, 0, 0, 0, 1]);
});

test("E11-02 · con cuantiles la misma distribución se reparte, y ningún escalón queda vacío", () => {
  const counts = spread(SKEWED, "quantile");
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    SKEWED.length
  );
  // 2/2/4/2/3/3/3: los empates (dos doses, dos treses) impiden el 3/3/3/3/3/2/2
  // exacto, y así tiene que ser — partir un empate para cuadrar el reparto sería
  // pintar de dos colores distintos el mismo número.
  assert.deepEqual(counts, [2, 2, 4, 2, 3, 3, 3]);
  assert.ok(
    counts.every((c) => c >= 2 && c <= 4),
    `se esperaba un reparto en torno a 3 por escalón y salió ${counts.join("/")}`
  );
});

test("E11-02 · empates: dos barrios con el mismo valor caen en el mismo escalón", () => {
  // Aunque desequilibre el recuento. Lo contrario —partir un empate para cuadrar
  // el reparto— sería pintar de dos colores distintos el mismo número.
  const breaks = classify(SKEWED, "quantile");
  const c = { kind: "quantile" as const, breaks, ramp: SEQUENTIAL_RAMP, inverted: false, min: 0, max: 120 };
  assert.equal(classIndex(2, c), classIndex(2, c));
  assert.equal(classIndex(3, c), classIndex(3, c));
});

test("E11-02 · cada métrica usa la clasificación que le toca", () => {
  // Sesgadas → cuantiles.
  assert.equal(classificationKind("members"), "quantile");
  assert.equal(classificationKind("leads"), "quantile");
  assert.equal(classificationKind("opp"), "quantile");
  // Ya acotadas por construcción → intervalo igual.
  assert.equal(classificationKind("conv"), "equal");
  assert.equal(classificationKind("dist"), "equal");
  // Con signo → divergente simétrica.
  assert.equal(classificationKind("trend"), "diverging");
});

test("Tendencia es divergente y simétrica, así que el cero cae siempre en el centro", () => {
  const c = classifyMetric(CITY, "trend");
  assert.equal(c.kind, "diverging");
  assert.equal(colorForValueClassified(0, c), DIVERGING_RAMP[3]);
  assert.equal(colorForValueClassified(-40, c), DIVERGING_RAMP[0]);
  assert.equal(colorForValueClassified(40, c), DIVERGING_RAMP[6]);

  // Y sigue centrada aunque la ciudad solo tenga barrios que crecen: si el cero
  // dependiera de los extremos observados, "sin cambio" se pintaría de rojo.
  const soloSuben = [barrio({ code: "a", trend: 10 }), barrio({ code: "b", trend: 40 })];
  assert.equal(colorForValueClassified(0, classifyMetric(soloSuben, "trend")), DIVERGING_RAMP[3]);
});

test("en Conversión la rampa se lee al revés: el terracota es el problema", () => {
  const c = classifyMetric(CITY, "conv");
  assert.equal(c.inverted, true);
  // "¿Dónde convierto peor?": el terracota tiene que ser el 10 %, no el 67 %.
  assert.equal(colorForValueClassified(10, c), SEQUENTIAL_RAMP[6]);
  assert.equal(colorForValueClassified(67, c), SEQUENTIAL_RAMP[0]);
  assert.deepEqual(c.ramp, [...SEQUENTIAL_RAMP].reverse());
});

test("una ciudad plana no divide por cero, se queda en un extremo", () => {
  const flat = [barrio({ code: "39001", members: 7 }), barrio({ code: "39002", members: 7 })];
  const c = classifyMetric(flat, "members");
  assert.equal(colorForValueClassified(7, c), c.ramp[c.ramp.length - 1]);
});

test("sin barrios no hay cortes, y nada revienta", () => {
  const c = classifyMetric([], "members");
  assert.deepEqual(c.breaks, []);
  assert.equal(colorForValueClassified(0, c), SEQUENTIAL_RAMP[0]);
  assert.equal(legendSteps(c).length, CLASS_COUNT);
});

test("la leyenda tiene siete escalones con su tramo, no dos extremos", () => {
  const c = classifyMetric(CITY, "members");
  const steps = legendSteps(c);
  assert.equal(steps.length, CLASS_COUNT);
  // El último no tiene cota superior: es "de aquí para arriba".
  assert.equal(steps[steps.length - 1].to, null);
  // Y los cortes van en orden ascendente, que es lo que hace legible la escala.
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i].from >= steps[i - 1].from, "los cortes de la leyenda no están ordenados");
  }
});

test("colorsByCode: el color de la celda y el del testigo de su fila salen del mismo sitio", () => {
  const colors = colorsByCode(CITY, "members");
  const c = classifyMetric(CITY, "members");
  assert.equal(colors["50005"], colorForValueClassified(30, c));
  assert.equal(Object.keys(colors).length, CITY.length);
});

test("sortByMetric: descendente salvo en Conversión, donde lo primero es el problema", () => {
  assert.deepEqual(
    sortByMetric(CITY, "members").map((p) => p.code),
    ["50005", "50001", "50019"]
  );
  assert.deepEqual(
    sortByMetric(CITY, "conv").map((p) => p.code),
    ["50019", "50005", "50001"]
  );
});

test("formatMetricValue: la tendencia positiva lleva signo y la distancia su unidad", () => {
  assert.equal(formatMetricValue(20, "trend"), "+20%");
  assert.equal(formatMetricValue(-40, "trend"), "-40%");
  assert.equal(formatMetricValue(0, "trend"), "0%");
  assert.equal(formatMetricValue(1.83, "dist"), "1.8 km");
  assert.equal(formatMetricValue(30, "members"), "30");
});

test("readableMetricInk: la cifra del escalón más claro se escribe en tinta de marca, no en hueso", () => {
  // E11-06 · La tinta de respaldo es un TOKEN y no un literal: sobre la tarjeta
  // oscura, `#1d1d1c` daba 1,07:1 — invisible.
  assert.equal(readableMetricInk(SEQUENTIAL_RAMP[0]), "var(--color-brand-text)");
  assert.equal(readableMetricInk(DIVERGING_RAMP[3]), "var(--color-brand-text)");
  assert.equal(readableMetricInk(SEQUENTIAL_RAMP[6]), SEQUENTIAL_RAMP[6]);
});

test("groupBarriosByCity: cada ciudad con sus barrios y su centro, Zaragoza primero", () => {
  const points = [
    barrio({ code: "39001", members: 12, total: 12, lat: 43.4623, lng: -3.8099 }),
    ...CITY,
    // Barrio sin dato: se queda en su ciudad (la teselación necesita el juego
    // completo, y un barrio a cero es media respuesta a "¿dónde abrir?").
    barrio({ code: "50011" }),
  ];
  const cities = groupBarriosByCity(points, [
    { id: "c1", name: "La Jota", lat: 41.6685, lng: -0.8815 },
    { id: "c2", name: "Santander Centro", lat: 43.4631, lng: -3.8085 },
  ]);

  assert.deepEqual(
    cities.map((c) => c.label),
    ["Zaragoza", "Santander"]
  );
  assert.equal(cities[0].points.length, 4);
  assert.deepEqual(cities[0].centers.map((c) => c.name), ["La Jota"]);
  assert.deepEqual(cities[1].centers.map((c) => c.name), ["Santander Centro"]);
});

test("groupBarriosByCity: una ciudad sin un solo cliente ni lead no se ofrece en el selector", () => {
  const cities = groupBarriosByCity(
    [barrio({ code: "50001" }), barrio({ code: "39001", leads: 3, total: 3, lat: 43.4623, lng: -3.8099 })],
    []
  );
  assert.deepEqual(
    cities.map((c) => c.label),
    ["Santander"]
  );
});

// ---------- E11-03 · El mapa es honesto cuando no hay centros situados ----------

const SIN_CENTROS = [
  barrio({ code: "50001", members: 10, leads: 5, total: 15, dist: 0, opp: 0, nearestCenter: null }),
  barrio({ code: "50005", members: 30, leads: 20, total: 50, dist: 0, opp: 0, nearestCenter: null }),
];

const CON_CENTROS = [
  barrio({ code: "50001", members: 10, dist: 0.4, opp: 1.1, nearestCenter: "La Jota" }),
  barrio({ code: "50005", members: 30, dist: 1.8, opp: 5.2, nearestCenter: "La Jota" }),
];

test("E11-03 · sin centros situados, distancia y oportunidad son null, no 0", () => {
  // `Center.lat/lng` son opcionales y la agregación devuelve 0: el mapa pintaba
  // toda la ciudad a 0,0 km. Un cero inventado sobre el que se decide dónde
  // abrir el próximo centro.
  assert.equal(metricValue(SIN_CENTROS[0], "dist"), null);
  assert.equal(metricValue(SIN_CENTROS[0], "opp"), null);
  // Las que no dependen de un centro siguen valiendo.
  assert.equal(metricValue(SIN_CENTROS[0], "members"), 10);
});

test("E11-03 · sus pastillas se deshabilitan, y solo esas", () => {
  assert.equal(metricAvailable(SIN_CENTROS, "dist"), false);
  assert.equal(metricAvailable(SIN_CENTROS, "opp"), false);
  assert.equal(metricAvailable(SIN_CENTROS, "members"), true);
  assert.equal(metricAvailable(SIN_CENTROS, "conv"), true);
});

test("E11-03 · el relleno es un gris de «sin dato», inconfundible con cualquier escalón", () => {
  const c = classifyMetric(SIN_CENTROS, "dist");
  assert.equal(colorForValueClassified(metricValue(SIN_CENTROS[0], "dist"), c), NO_DATA_FILL);
  assert.ok(!SEQUENTIAL_RAMP.includes(NO_DATA_FILL));
  assert.ok(!DIVERGING_RAMP.includes(NO_DATA_FILL));
  // Y la leyenda sabe que tiene que explicarlo.
  assert.equal(hasMissingValues(SIN_CENTROS, "dist"), true);
  assert.equal(hasMissingValues(SIN_CENTROS, "members"), false);
});

test("E11-03 · un barrio sin dato no se escribe como cero, se escribe como raya", () => {
  assert.equal(formatMetricValue(null, "dist"), "—");
  assert.equal(formatMetricValue(0, "dist"), "0 km");
});

test("E11-03 · los barrios sin dato no desplazan los cortes ni encabezan el ranking", () => {
  const mezcla = [
    barrio({ code: "a", dist: 5, nearestCenter: "X" }),
    barrio({ code: "b", dist: 0, nearestCenter: null }),
    barrio({ code: "c", dist: 1, nearestCenter: "X" }),
  ];
  // Si el cero inventado contara, arrastraría el mínimo y todos los cortes.
  const c = classifyMetric(mezcla, "dist");
  assert.equal(c.min, 1);
  assert.deepEqual(
    sortByMetric(mezcla, "dist").map((p) => p.code),
    ["a", "c", "b"]
  );
});

test("E11-03 · con centros situados el comportamiento no cambia", () => {
  assert.equal(metricAvailable(CON_CENTROS, "dist"), true);
  assert.equal(metricValue(CON_CENTROS[1], "dist"), 1.8);
  assert.equal(hasMissingValues(CON_CENTROS, "dist"), false);
  const c = classifyMetric(CON_CENTROS, "dist");
  assert.notEqual(colorForValueClassified(1.8, c), NO_DATA_FILL);
});

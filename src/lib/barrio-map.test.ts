import test from "node:test";
import assert from "node:assert/strict";
import {
  DIVERGING_RAMP,
  SEQUENTIAL_RAMP,
  colorForValue,
  colorsByCode,
  formatMetricValue,
  groupBarriosByCity,
  metricScale,
  rampForScale,
  readableMetricInk,
  sortByMetric,
  type BarrioStat,
} from "./barrio-map";

// Lo que se comprueba aquí es la lectura del mapa, no su aspecto: que la rampa
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

test("metricScale: los extremos son los de la ciudad activa, no unos globales", () => {
  const scale = metricScale(CITY, "members");
  assert.deepEqual({ min: scale.min, max: scale.max, kind: scale.kind }, { min: 2, max: 30, kind: "seq" });
});

test("metricScale: Tendencia es divergente y simétrica, así que el cero cae siempre en el centro", () => {
  const scale = metricScale(CITY, "trend");
  assert.equal(scale.kind, "div");
  assert.equal(scale.min, -40);
  assert.equal(scale.max, 40);
  assert.equal(colorForValue(0, scale), DIVERGING_RAMP[3]);
  assert.equal(colorForValue(-40, scale), DIVERGING_RAMP[0]);
  assert.equal(colorForValue(40, scale), DIVERGING_RAMP[6]);
});

test("colorForValue: la secuencial va de hueso a terracota, y en Conversión al revés", () => {
  const members = metricScale(CITY, "members");
  assert.equal(colorForValue(2, members), SEQUENTIAL_RAMP[0]);
  assert.equal(colorForValue(30, members), SEQUENTIAL_RAMP[6]);

  // "¿Dónde convierto peor?": el terracota tiene que ser el 10 %, no el 67 %.
  const conv = metricScale(CITY, "conv");
  assert.equal(conv.inverted, true);
  assert.equal(colorForValue(10, conv), SEQUENTIAL_RAMP[6]);
  assert.equal(colorForValue(67, conv), SEQUENTIAL_RAMP[0]);
  assert.deepEqual(rampForScale(conv), [...SEQUENTIAL_RAMP].reverse());
});

test("colorForValue: una ciudad plana no divide por cero, se queda en un extremo", () => {
  const flat = [barrio({ code: "39001", members: 7 }), barrio({ code: "39002", members: 7 })];
  const scale = metricScale(flat, "members");
  assert.equal(colorForValue(7, scale), SEQUENTIAL_RAMP[0]);
});

test("colorsByCode: el color de la celda y el del testigo de su fila salen del mismo sitio", () => {
  const colors = colorsByCode(CITY, "members");
  assert.equal(colors["50005"], colorForValue(30, metricScale(CITY, "members")));
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

test("readableMetricInk: la cifra del escalón más claro se escribe en tinta, no en hueso", () => {
  assert.equal(readableMetricInk(SEQUENTIAL_RAMP[0]), "#1d1d1c");
  assert.equal(readableMetricInk(DIVERGING_RAMP[3]), "#1d1d1c");
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

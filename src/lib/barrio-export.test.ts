import test from "node:test";
import assert from "node:assert/strict";

import { barrioExportFileName, barrioTableCsv } from "@/lib/barrio-export";
import { BARRIO_METRICS, type BarrioStat } from "@/lib/barrio-map";

/**
 * E14-10 · La tabla de CP se puede exportar. Lo que hay que probar no es que
 * salga un CSV, sino que el CSV **diga lo que se estaba mirando**: sin periodo
 * ni filtro de estado, el fichero es una lista de números que nadie puede
 * volver a interpretar dentro de seis meses.
 */

const CONTEXT = {
  cityLabel: "Zaragoza",
  rangeLabel: "trimestre en curso",
  stateLabel: "Socios vivos",
  centerLabel: null,
};

function point(over: Partial<BarrioStat> = {}): BarrioStat {
  return {
    code: "50014",
    name: "La Jota",
    lat: 41.66,
    lng: -0.87,
    leads: 12,
    members: 30,
    total: 42,
    conv: 71.4,
    trend: -12.5,
    dist: 1.4,
    opp: 0.4,
    nearestCenter: "La Jota",
    churn: 3,
    ...over,
  };
}

function parse(csv: string): string[][] {
  return csv.replace(/^﻿/, "").split("\r\n").map((line) => line.split(";"));
}

test("E14-10 · el fichero lleva las siete métricas, no solo la que pinta el mapa", () => {
  const [headers] = parse(barrioTableCsv([point()], CONTEXT));
  for (const metric of BARRIO_METRICS) {
    assert.ok(headers.includes(metric.label), `falta la columna ${metric.label}`);
  }
  assert.ok(headers.includes("CodigoPostal"));
  assert.ok(headers.includes("Barrio"));
});

test("E14-10 · las tres métricas que pidió negocio están, y con su valor", () => {
  const [headers, row] = parse(barrioTableCsv([point()], CONTEXT));
  const at = (label: string) => row[headers.indexOf(label)];
  assert.equal(at("Clientes"), "30");
  assert.equal(at("Leads"), "12");
  assert.equal(at("Conversión"), "71,4", "decimal con coma: el CSV es el formato español");
});

test("E14-10 · cada fila declara periodo, estado, ciudad y centro", () => {
  const [headers, row] = parse(barrioTableCsv([point()], { ...CONTEXT, centerLabel: "La Jota" }));
  const at = (label: string) => row[headers.indexOf(label)];
  assert.equal(at("Periodo"), "trimestre en curso");
  assert.equal(at("Estado"), "Socios vivos");
  assert.equal(at("Ciudad"), "Zaragoza");
  assert.equal(at("Centro"), "La Jota");
});

test("E14-10 · sin centro elegido el fichero lo dice, en vez de dejarlo en blanco", () => {
  const [headers, row] = parse(barrioTableCsv([point()], CONTEXT));
  assert.equal(row[headers.indexOf("Centro")], "Todos los centros");
});

test("E14-10 · un cero inventado no llega a la hoja de cálculo (E11-03)", () => {
  // Sin ningún centro situado, `dist` y `opp` no se pueden calcular. La celda
  // sale VACÍA: un cero en una hoja se suma, se promedia y acaba en una
  // decisión de inversión.
  const [headers, row] = parse(barrioTableCsv([point({ nearestCenter: null, dist: 0, opp: 0 })], CONTEXT));
  assert.equal(row[headers.indexOf("Distancia")], "");
  assert.equal(row[headers.indexOf("Oportunidad")], "");
  assert.equal(row[headers.indexOf("Centro mas cercano")], "");
});

test("E14-10 · una métrica que la agregación todavía no calcula sale vacía, no a cero", () => {
  const [headers, row] = parse(barrioTableCsv([point({ churn: undefined })], CONTEXT));
  assert.equal(row[headers.indexOf("Bajas")], "");
});

test("E14-10 · el fichero sale en el mismo orden que la pantalla", () => {
  const rows = [point({ code: "50014", name: "La Jota" }), point({ code: "50001", name: "Centro" })];
  const lines = parse(barrioTableCsv(rows, CONTEXT));
  assert.deepEqual([lines[1][0], lines[2][0]], ["50014", "50001"]);
});

test("E14-10 · el nombre del fichero dice de qué ciudad y de qué día es", () => {
  assert.equal(
    barrioExportFileName("Zaragoza", new Date("2026-09-15T10:00:00Z")),
    "codigos-postales-zaragoza-2026-09-15.csv",
  );
  assert.equal(
    barrioExportFileName("Otras zonas", new Date("2026-01-02T10:00:00Z")),
    "codigos-postales-otras-zonas-2026-01-02.csv",
  );
});

test("E14-10 · un nombre de barrio con punto y coma no parte la fila", () => {
  const lines = parse(barrioTableCsv([point({ name: 'Delicias; "sur"' })], CONTEXT));
  const [headers] = lines;
  assert.equal(lines[1].length, headers.length + 1, "el entrecomillado mete un ; dentro de la celda");
  assert.ok(barrioTableCsv([point({ name: 'Delicias; "sur"' })], CONTEXT).includes('"Delicias; ""sur"""'));
});

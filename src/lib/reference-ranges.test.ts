import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { getReferenceRange, statusForValue, formatTrend, trendAgainstPrevious } from "@/lib/reference-ranges";

/**
 * E3-09 · Rangos de composición corporal por sexo y edad, o sin semáforo.
 *
 * `reference-ranges.ts` fijaba `bodyFatPct: { min: 8, max: 19 }` unisex y sin
 * edad: los rangos del informe Tanita de un hombre de 28 años convertidos en el
 * defecto de toda la aplicación — y era el defecto que se usaba mientras
 * dirección no creara filas, o sea siempre. Una socia de 52 años con un 29 % de
 * grasa, perfectamente normal, salía `critical` en su ficha y en su portal.
 */

const SLUG = "e2e-reference-ranges-test";
let orgId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Rangos", slug: SLUG } });
  orgId = org.id;
  await prisma.referenceRange.createMany({
    data: [
      { orgId, metric: "bodyFatPct", sex: "F", ageMin: 40, ageMax: 59, min: 23, max: 35 },
      { orgId, metric: "bodyFatPct", sex: "M", ageMin: 18, ageMax: 39, min: 8, max: 19 },
    ],
  });
});

after(async () => {
  if (!orgId) return;
  await prisma.referenceRange.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E3-09 · una socia de 52 años con 29 % de grasa NO sale en rojo", async () => {
  const range = await getReferenceRange(orgId, "bodyFatPct", { sex: "FEMALE", age: 52 });
  assert.deepEqual(range, { min: 23, max: 35 });
  assert.equal(statusForValue(29, range), "good", "es un valor perfectamente normal para ella");
});

test("E3-09 · sin fila para su sexo y edad, el valor va SIN semáforo", async () => {
  // Socia de 25: hay fila de mujer 40-59 y de hombre 18-39, ninguna le encaja.
  const range = await getReferenceRange(orgId, "bodyFatPct", { sex: "FEMALE", age: 25 });
  assert.deepEqual(range, { min: null, max: null }, "no hay rango que aplicar");
  assert.equal(statusForValue(29, range), "unknown", "nunca rojo por defecto");
});

test("E3-09 · el defecto unisex de un hombre de 28 años desaparece del código", () => {
  // Sin los comentarios: la cabecera SÍ cita los valores retirados, para que
  // quien pase por aquí sepa qué se quitó y por qué.
  const code = readFileSync("src/lib/reference-ranges.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.ok(!/DEFAULT_RANGES/.test(code), "no queda tabla de valores por defecto");
  assert.ok(!/min:\s*8/.test(code), "ni el rango del informe Tanita escrito a mano en el código");
});

test("E3-09 · una métrica sin ninguna fila configurada tampoco se pinta", async () => {
  const range = await getReferenceRange(orgId, "visceralFatRating", { sex: "MALE", age: 30 });
  assert.deepEqual(range, { min: null, max: null });
  assert.equal(statusForValue(12, range), "unknown");
});

test("E3-09 · el % graso se presenta como tendencia contra la medición anterior", () => {
  assert.deepEqual(trendAgainstPrevious(28.4, 29.6), { delta: -1.2, direction: "down", previous: 29.6 });
  assert.equal(formatTrend(trendAgainstPrevious(28.4, 29.6)), "−1,2 pts desde la toma anterior");
  assert.equal(formatTrend(trendAgainstPrevious(29, 29)), "Sin cambio desde la toma anterior");
  // Sin medición anterior no hay tendencia que inventar.
  assert.equal(formatTrend(trendAgainstPrevious(29, null)), null);
});

test("E3-09 · la fila más específica gana a la genérica", async () => {
  await prisma.referenceRange.create({
    data: { orgId, metric: "bmi", sex: null, ageMin: null, ageMax: null, min: 18.5, max: 25 },
  });
  await prisma.referenceRange.create({
    data: { orgId, metric: "bmi", sex: null, ageMin: 65, ageMax: null, min: 22, max: 27 },
  });

  const mayor = await getReferenceRange(orgId, "bmi", { sex: "FEMALE", age: 72 });
  assert.deepEqual(mayor, { min: 22, max: 27 });
  assert.equal(statusForValue(26, mayor), "good", "un IMC de 26 a los 72 no es una alarma");
});

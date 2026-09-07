import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { buildCompositionView } from "@/lib/composition-view";

/**
 * E3-10 · "Edad metabólica" deja de pintarse.
 *
 * En una ficha con membrete del centro, "Edad metabólica: 47" parece un
 * diagnóstico. Es marketing de un fabricante de básculas, y no se presenta como
 * métrica de seguimiento — ni en la ficha ni en el portal. El dato se conserva.
 */

const SLUG = "e2e-composition-view-test";
let orgId: string;

function entry(over: Partial<Parameters<typeof buildCompositionView>[2][number]> = {}) {
  return {
    date: new Date("2026-09-01"),
    measuredAt: new Date("2026-09-01"),
    weightKg: 62,
    bodyFatPct: 29,
    muscleMassKg: 40,
    fatMassKg: 18,
    bmi: 23,
    visceralFatRating: 4,
    boneMassKg: 2.4,
    bodyWaterPct: 52,
    bmrKcal: 1350,
    metabolicAge: 47,
    ...over,
  };
}

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Composición", slug: SLUG } });
  orgId = org.id;
});

after(async () => {
  if (!orgId) return;
  await prisma.referenceRange.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E3-10 · la edad metabólica no está entre las tarjetas de la ficha", async () => {
  const view = await buildCompositionView(orgId, new Date("1974-01-01"), [entry()], "FEMALE");

  const labels = view.compositionTiles.map((t) => t.label);
  assert.ok(!labels.includes("Edad metabólica"), labels.join(", "));
  assert.ok(labels.includes("% graso"), "el resto de la composición sigue estando");
});

test("E3-10 · en el portal tampoco: es la misma vista", () => {
  // Ficha y portal comparten `buildCompositionView` y `CompositionSummary`, así
  // que retirar la tarjeta lo retira de los dos sitios a la vez.
  const portal = readFileSync("src/app/(app)/portal/evolucion/page.tsx", "utf8");
  assert.match(portal, /CompositionSummary/);
  assert.ok(!portal.includes("metabolicAge"));
});

test("E3-10 · el dato se conserva: sigue importándose y sale en la exportación", () => {
  const tanita = readFileSync("src/lib/tanita-parse.ts", "utf8");
  assert.match(tanita, /metabolicAge/, "se sigue leyendo de la báscula");

  const exportSource = readFileSync("src/lib/member-data-export.ts", "utf8");
  assert.match(exportSource, /edadMetabolica: p\.metabolicAge/, "y es suyo: sale al ejercer sus derechos");
});

test("E3-09/E3-10 · sin rango configurado el % graso va sin semáforo, con su tendencia", async () => {
  const view = await buildCompositionView(
    orgId,
    new Date("1974-01-01"),
    [entry({ bodyFatPct: 28.4 }), entry({ date: new Date("2026-06-01"), measuredAt: new Date("2026-06-01"), bodyFatPct: 29.6 })],
    "FEMALE"
  );

  const graso = view.compositionTiles.find((t) => t.label === "% graso");
  assert.equal(graso?.status, "unknown", "esta organización no tiene rangos: no hay color que pintar");
  assert.equal(graso?.foot, "−1,2 pts desde la toma anterior");
});

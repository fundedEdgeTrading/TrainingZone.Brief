import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  listZonesPendingReview,
  migrateInjuryZonesForOrg,
  totalUnmapped,
} from "@/lib/injury-zone-migration";

/**
 * E3-02 · escenario "migración de datos existentes": las filas de texto libre se
 * normalizan con el mapeo declarado, las que no se puedan mapear quedan
 * marcadas para revisión manual —nunca descartadas— y el informe dice cuántas.
 */

const SLUG = "e2e-migracion-zonas-test";
let fx: { orgId: string; centerId: string; memberId: string };

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Migración zonas", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro zonas", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Zonas",
      email: `${SLUG}@example.com`,
    },
  });
  fx = { orgId: org.id, centerId: center.id, memberId: member.id };

  await prisma.healthRecord.createMany({
    data: [
      // Las cuatro grafías que convivían y que no casaban entre sí.
      { memberId: member.id, type: "INJURY", zone: "hombro derecho", description: "Tendinopatía", severity: "MEDIUM" },
      { memberId: member.id, type: "INJURY", zone: "Hombro Dcho.", description: "Sobrecarga", severity: "LOW" },
      { memberId: member.id, type: "INJURY", zone: "zona lumbar", description: "Lumbalgia", severity: "HIGH" },
      // Y una que el mapeo declarado no conoce.
      { memberId: member.id, type: "INJURY", zone: "lo de siempre", description: "Molestia", severity: "LOW" },
    ],
  });
  await prisma.aptitudeRule.createMany({
    data: [
      { orgId: org.id, injuryZone: "hombro izquierdo", blockArea: "Empuje vertical", light: "RED" },
      { orgId: org.id, injuryZone: "chirimoya", blockArea: "Tren inferior", light: "AMBER" },
    ],
  });
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.healthRecord.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.aptitudeRule.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

test("E3-02 · la migración normaliza, cuenta y no descarta nada", async () => {
  const report = await migrateInjuryZonesForOrg({ orgId: fx.orgId });

  assert.equal(report.healthRecords.candidates, 4);
  assert.equal(report.healthRecords.mapped, 3);
  assert.equal(report.healthRecords.unmapped, 1);
  assert.equal(report.aptitudeRules.mapped, 1);
  assert.equal(report.aptitudeRules.unmapped, 1);
  assert.equal(totalUnmapped(report), 2, "el informe dice cuántas quedaron sin mapear");

  // Las dos grafías de hombro derecho son ahora la MISMA zona y el MISMO lado.
  const hombros = await prisma.healthRecord.findMany({
    where: { memberId: fx.memberId, zoneCode: "HOMBRO" },
    select: { side: true },
  });
  assert.equal(hombros.length, 2);
  assert.ok(hombros.every((h) => h.side === "DERECHA"));

  const lumbar = await prisma.healthRecord.findFirstOrThrow({
    where: { memberId: fx.memberId, zoneCode: "LUMBAR" },
  });
  assert.equal(lumbar.side, "NO_APLICA", "una zona axial no tiene lado");

  // La fila sin mapear sigue AHÍ, con su texto intacto y marcada para revisión.
  const huerfana = await prisma.healthRecord.findFirstOrThrow({
    where: { memberId: fx.memberId, zone: "lo de siempre" },
  });
  assert.equal(huerfana.zoneCode, null);
  assert.equal(huerfana.description, "Molestia");

  const pending = await listZonesPendingReview(fx.orgId);
  assert.equal(pending.length, 2);
  assert.deepEqual(
    pending.map((p) => p.text).sort(),
    ["chirimoya", "lo de siempre"],
    "las que quedan se pueden ir a buscar por su texto original"
  );

  // Y la migración deja su propia traza, con las pendientes nombradas.
  const traza = await prisma.auditLog.findFirstOrThrow({
    where: { orgId: fx.orgId, action: "HEALTH_INJURY_ZONE_MIGRATED" },
  });
  const metadata = traza.metadata as { healthRecords: { unmapped: number } };
  assert.equal(metadata.healthRecords.unmapped, 1);
});

test("E3-02 · repetir la migración no vuelve a tocar lo ya normalizado", async () => {
  const again = await migrateInjuryZonesForOrg({ orgId: fx.orgId });
  assert.equal(again.healthRecords.mapped, 0);
  assert.equal(again.healthRecords.candidates, 1, "solo queda la que espera revisión manual");
});

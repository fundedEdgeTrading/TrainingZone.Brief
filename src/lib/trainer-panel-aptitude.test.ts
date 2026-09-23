import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getTrainerPanelData, panelAptitude } from "@/lib/trainer-panel-queries";
import { getSessionBrief, type BriefRule } from "@/lib/brief-queries";
import {
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  type RegressionMember,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * QA-RES-06 · R12: en `/trainer`, el semáforo de un socio con lesión de HOMBRO
 * es el mismo color que en el brief, y SIN la descripción clínica.
 *
 * El panel emparejaba `rule.injuryZone === record.zone`: dos textos libres
 * deprecados por E3-02. "hombro dcho" contra "Hombro" no casaba y el socio
 * salía sin semáforo en el panel mientras el brief —que empareja por
 * `zoneCode` + `side` con `resolveAptitude`— lo pintaba en rojo. Y además
 * mandaba al cliente `record.description` (medicación, patologías), que el
 * brief dejó de enviar en E3-05: el entrenador lee adaptaciones, no historiales.
 */

const TAG = "qa-res-06";
const DESCRIPTION = "Rotura parcial del supraespinoso; toma ibuprofeno 600";
let org: RegressionOrg;
let socio: RegressionMember;
let sessionId: string;

before(async () => {
  await cleanup();
  org = await createRegressionOrg(TAG);
  socio = await createRegressionMember(org, TAG, 1, 5);

  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name: "EP hombro",
      classType: "Personal Training",
      date: day,
      startTime: "23:00",
      endTime: "23:59",
      capacity: 1,
    },
  });
  sessionId = session.id;
  await prisma.booking.create({
    data: { sessionId, occurrenceDate: day, memberId: socio.id, status: "BOOKED", subscriptionId: socio.subscriptionId },
  });

  await prisma.healthRecord.create({
    data: {
      memberId: socio.id,
      type: "INJURY",
      // Texto heredado que NO coincide con el `injuryZone` de la regla: es el
      // caso real que dejaba el panel en blanco.
      zone: "hombro dcho",
      zoneCode: "HOMBRO",
      side: "DERECHA",
      description: DESCRIPTION,
      severity: "HIGH",
    },
  });
  await prisma.aptitudeRule.create({
    data: {
      orgId: org.orgId,
      injuryZone: "Hombro",
      zoneCode: "HOMBRO",
      blockArea: "Empuje vertical",
      light: "RED",
      adaptation: "Sin press por encima de la cabeza",
    },
  });
});

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: `e7-07-${TAG}` } }, select: { id: true } });
  for (const o of orgs) {
    await prisma.healthRecord.deleteMany({ where: { member: { orgId: o.id } } });
    await prisma.aptitudeRule.deleteMany({ where: { orgId: o.id } });
  }
  await cleanupRegressionOrgs(TAG);
}

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("QA-RES-06 · R12: el panel pinta el mismo color que el brief para una lesión de hombro", async () => {
  const brief = await getSessionBrief({
    orgId: org.orgId,
    sessionId,
    actorUserId: org.trainerId,
    actorRole: "TRAINER",
    actorCenterId: org.centerId,
  });
  assert.ok(brief);
  const briefLight = brief.roster.find((r) => r.member.id === socio.id)?.light;
  assert.equal(briefLight, "RED");

  const panel = await getTrainerPanelData(org.orgId, org.trainerId, "TRAINER", "Europe/Madrid");
  const client = panel.epClients.find((c) => c.id === socio.id);
  assert.ok(client, "el socio es cliente de EP del entrenador");
  assert.equal(client.light, briefLight, "el panel y el brief no pueden discrepar");

  const alert = panel.aptitudeAlerts.find((a) => a.memberId === socio.id);
  assert.ok(alert, "un rojo sale en las alertas de aptitud");
  assert.equal(alert.zone, "Lesión · Hombro derecho", "el rótulo sale de conditionLabel, como en el brief");
  assert.equal(alert.adaptation, "Sin press por encima de la cabeza");
  assert.ok(!("description" in alert), "la descripción clínica no viaja al panel");
  assert.ok(!JSON.stringify(panel).includes("supraespinoso"), "ni por ningún otro campo");

  // La lectura sigue auditada.
  assert.equal(
    await prisma.auditLog.count({ where: { orgId: org.orgId, action: "TRAINER_PANEL_HEALTH_READ", actorUserId: org.trainerId } }),
    1
  );
});

test("QA-RES-06 · recepción no recibe semáforo ni deja lectura de salud", async () => {
  const before = await prisma.auditLog.count({ where: { orgId: org.orgId, action: "TRAINER_PANEL_HEALTH_READ" } });
  const panel = await getTrainerPanelData(org.orgId, org.trainerId, "RECEPTION", "Europe/Madrid");
  assert.equal(panel.epClients.find((c) => c.id === socio.id)?.light, null);
  assert.equal(panel.aptitudeAlerts.length, 0);
  assert.equal(await prisma.auditLog.count({ where: { orgId: org.orgId, action: "TRAINER_PANEL_HEALTH_READ" } }), before);
});

const rule = (over: Partial<BriefRule>): BriefRule => ({
  injuryZone: "Hombro",
  zoneCode: "HOMBRO",
  side: null,
  blockArea: "Empuje vertical",
  light: "RED",
  adaptation: "Sin press por encima de la cabeza",
  ...over,
});

test("QA-RES-06 · panelAptitude respeta el lado de la regla", () => {
  const derecho = { zone: null, zoneCode: "HOMBRO" as const, side: "DERECHA" as const, type: "INJURY" };
  // Una regla del hombro IZQUIERDO no casa con una lesión del derecho: queda
  // como condición sin regla, que es ámbar (E3-03), nunca verde ni rojo.
  const soloIzquierdo = panelAptitude([derecho], [rule({ side: "IZQUIERDA" })]);
  assert.equal(soloIzquierdo?.light, "AMBER");
  assert.equal(soloIzquierdo?.adaptation, null);

  const cualquierLado = panelAptitude([derecho], [rule({})]);
  assert.equal(cualquierLado?.light, "RED");
  assert.equal(cualquierLado?.label, "Lesión · Hombro derecho");
});

test("QA-RES-06 · sin nada declarado no hay semáforo", () => {
  assert.equal(panelAptitude([], [rule({})]), null);
});

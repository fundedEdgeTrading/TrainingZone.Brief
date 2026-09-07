import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getMemberDataExport, rightsDeadline, RIGHTS_RESPONSE_DAYS } from "@/lib/member-data-export";

/**
 * E10-11 · Exportación de datos del socio completa y auditada.
 *
 * Faltaban `consentAI` (el bloque listaba cuatro de los cinco consentimientos),
 * `Assessment` —donde vive el grueso del dato clínico declarado—,
 * `PerformanceMetric`, `Mesocycle`, `SessionDebrief` y el `AuditLog` de accesos
 * a sus propios datos. `MemberNote` se excluía a propósito, y el razonamiento
 * era correcto PARA EL ART. 20; el art. 15 sí las alcanza.
 */

const SLUG = "e2e-data-export-test";

type Fixture = { orgId: string; memberId: string; staffId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Exportación", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro exportación", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socia",
      lastName: "Derechos",
      email: `${SLUG}@example.com`,
      consentHealth: true,
      consentHealthAt: new Date(),
      consentAI: true,
      consentAIAt: new Date(),
    },
  });
  const email = `${SLUG}-staff@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const staff = await prisma.user.create({
    data: { orgId: org.id, identityId: identity.id, name: "Dirección", email, role: "OWNER" },
  });

  await prisma.assessment.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      kind: "INITIAL",
      dueDate: new Date(),
      answers: { pesoKg: 62, dolorActual: 3 },
      completedAt: new Date(),
    },
  });
  await prisma.performanceMetric.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      key: "carga_bisagra",
      value: 60,
      unit: "kg",
      recordedAt: new Date(),
      source: "assessment",
    },
  });
  await prisma.mesocycle.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      createdByUserId: staff.id,
      title: "Fuerza base",
      objective: "Recuperar fuerza",
      safetyCriteria: [],
      weeklyLayout: ["Lun TZ"],
      milestones: [],
      phases: { create: [{ order: 0, name: "Adaptación", weekFrom: 1, weekTo: 3, deload: false }] },
    },
  });
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: "Grupo reducido",
      classType: "GROUP",
      date: new Date(),
      startTime: "10:00",
      endTime: "11:00",
      capacity: 8,
    },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, occurrenceDate: session.date, status: "ATTENDED" },
  });
  await prisma.sessionDebrief.create({
    data: { bookingId: booking.id, feeling: "GREEN", note: "Buena sesión" },
  });
  await prisma.memberNote.create({
    data: { orgId: org.id, memberId: member.id, authorUserId: staff.id, body: "Vigilar la renovación del bono." },
  });
  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorUserId: staff.id,
      action: "HEALTH_RECORD_READ",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
    },
  });

  fx = { orgId: org.id, memberId: member.id, staffId: staff.id };
});

after(async () => {
  if (!fx) return;
  await prisma.sessionDebrief.deleteMany({ where: { booking: { memberId: fx.memberId } } });
  await prisma.booking.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.classSession.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.mesocycle.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.performanceMetric.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.assessment.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.memberNote.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.memberProgressEntry.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

test("E10-11 · los cinco consentimientos, no cuatro", async () => {
  const data = await getMemberDataExport(fx.memberId, fx.orgId);
  assert.ok(data);
  assert.deepEqual(Object.keys(data.consentimientos).sort(), [
    "contrato",
    "datosSalud",
    "marketing",
    "tratamientoPorIA",
    "usoImagenes",
  ]);
  assert.equal(data.consentimientos.tratamientoPorIA.aceptado, true);
});

test("E10-11 · entran Assessment, PerformanceMetric, Mesocycle y SessionDebrief", async () => {
  const data = await getMemberDataExport(fx.memberId, fx.orgId);
  assert.ok(data);

  assert.equal(data.valoraciones.length, 1, "donde vive el grueso del dato clínico declarado");
  assert.deepEqual(data.valoraciones[0].respuestas, { pesoKg: 62, dolorActual: 3 });
  assert.equal(data.marcas[0].clave, "carga_bisagra");
  assert.equal(data.mesociclos[0].titulo, "Fuerza base");
  assert.equal(data.mesociclos[0].fases[0].nombre, "Adaptación");
  assert.equal(data.debriefsDeSesion[0].valoracion, "GREEN");
});

test("E10-11 · art. 20 · la portabilidad no lleva notas internas ni accesos", async () => {
  const data = await getMemberDataExport(fx.memberId, fx.orgId, "PORTABILIDAD");
  assert.ok(data);
  assert.equal(data.alcance, "PORTABILIDAD");
  assert.match(data.baseJuridica, /Art\. 20/);
  assert.equal("notasInternas" in data, false);
  assert.equal("accesosATusDatos" in data, false);
});

test("E10-11 · art. 15 · el acceso sí alcanza a las notas y al registro de accesos", async () => {
  const data = await getMemberDataExport(fx.memberId, fx.orgId, "ACCESO");
  assert.ok(data);
  assert.match(data.baseJuridica, /Art\. 15/);

  const notas = data.notasInternas;
  const accesos = data.accesosATusDatos;
  assert.ok(notas && accesos, "el art. 15 alcanza a las notas y al registro de accesos");
  assert.equal(notas[0].texto, "Vigilar la renovación del bono.");
  assert.equal(accesos[0].accion, "HEALTH_RECORD_READ");
  assert.equal(accesos[0].quien, "Dirección");
});

test("E10-11 · el plazo del art. 12.3 es un mes desde la solicitud", () => {
  const requested = new Date(2026, 8, 6);
  const deadline = rightsDeadline(requested);
  assert.equal(RIGHTS_RESPONSE_DAYS, 30);
  assert.equal(deadline.getTime() - requested.getTime(), 30 * 24 * 60 * 60 * 1000);
});

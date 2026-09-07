import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { saveAssessment } from "@/lib/assessments/save";
import {
  MOBILITY_CHECKS,
  MOVEMENT_PATTERNS,
  assessmentSchemaFor,
  loadMetricKey,
} from "@/lib/assessments/schemas";

/**
 * E3-11 · La valoración incorpora patrones de movimiento, movilidad y cargas.
 *
 * De los siete patrones que la propia metodología exige no se evaluaba ninguno:
 * lo más cercano era `experiencia.tecnicaBasicos`, una autopercepción. Y las
 * marcas eran un catálogo cerrado de cuatro. Ni bisagra, ni sentadilla, ni
 * empuje horizontal, ni movilidad de tobillo u hombro, ni carga de referencia.
 */

const SLUG = "e2e-assessment-movement-test";

type Fixture = { orgId: string; memberId: string; trainerId: string; assessmentId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Movimiento", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro movimiento", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Movimiento",
      email: `${SLUG}@example.com`,
      consentHealth: true,
      consentHealthAt: new Date(),
    },
  });
  const email = `${SLUG}-trainer@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const trainer = await prisma.user.create({
    data: { orgId: org.id, identityId: identity.id, name: "Entrenador", email, role: "TRAINER" },
  });
  const assessment = await prisma.assessment.create({
    data: { orgId: org.id, memberId: member.id, kind: "M1", dueDate: new Date(), answers: {} },
  });

  fx = { orgId: org.id, memberId: member.id, trainerId: trainer.id, assessmentId: assessment.id };
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.performanceMetric.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.assessment.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.clientGoal.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.healthRecord.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.memberProgressEntry.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

test("E3-11 · el cuestionario acepta los siete patrones, los tres chequeos y las cargas", () => {
  assert.equal(MOVEMENT_PATTERNS.length, 7, "los siete de la metodología, ni uno menos");
  assert.deepEqual([...MOBILITY_CHECKS], ["TOBILLO", "CADERA", "HOMBRO"]);

  const parsed = assessmentSchemaFor("M1").safeParse({
    pesoKg: 70,
    dolorActual: 2,
    calidadSueno: 3,
    estres: 3,
    energia: 3,
    diasPorSemana: "2",
    movimiento: {
      patrones: {
        BISAGRA: { nivel: "EJECUTA", nota: "" },
        SENTADILLA: { nivel: "CON_REGRESION", nota: "Talón elevado" },
        EMPUJE_VERTICAL: { nivel: "NO_EJECUTA", nota: "" },
      },
      movilidad: { TOBILLO: false, CADERA: true, HOMBRO: true },
      cargas: { BISAGRA: 60, SENTADILLA: 40 },
    },
    seguimiento: { adherenciaPercibida: 4, progresoPercibido: 4 },
    cierre: {},
  });

  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});

test("E3-11 · un nivel inventado no cuela: es un catálogo cerrado", () => {
  const parsed = assessmentSchemaFor("M1").safeParse({
    pesoKg: 70,
    dolorActual: 2,
    calidadSueno: 3,
    estres: 3,
    energia: 3,
    diasPorSemana: "2",
    movimiento: { patrones: { BISAGRA: { nivel: "REGULAR", nota: "" } } },
    seguimiento: {},
    cierre: {},
  });
  assert.equal(parsed.success, false);
});

test("E3-11 · las cargas de referencia se pueden comparar entre valoraciones", async () => {
  const result = await saveAssessment({
    assessmentId: fx.assessmentId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    answers: {
      pesoKg: 70,
      dolorActual: 2,
      movimiento: {
        patrones: { BISAGRA: { nivel: "EJECUTA", nota: "" } },
        movilidad: { TOBILLO: false },
        cargas: { BISAGRA: 60, SENTADILLA: 40 },
      },
      calidadSueno: 3,
      estres: 3,
      energia: 3,
      diasPorSemana: "2",
      seguimiento: {
        adherenciaPercibida: 4,
        progresoPercibido: 4,
        queHaMejorado: "",
        obstaculos: "",
        objetivoProximoPeriodo: "",
      },
      marcas: [],
      cierre: { notasEntrenador: "" },
      custom: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });
  assert.equal(result.ok, true);

  // Las cargas viven en PerformanceMetric, con su fecha: es lo que las hace
  // comparables sin releer y parsear todos los cuestionarios del socio.
  const bisagra = await prisma.performanceMetric.findFirstOrThrow({
    where: { memberId: fx.memberId, key: loadMetricKey("BISAGRA") },
  });
  assert.equal(bisagra.value, 60);
  assert.equal(bisagra.unit, "kg");
  assert.ok(bisagra.recordedAt instanceof Date, "con fecha");

  const todas = await prisma.performanceMetric.findMany({
    where: { memberId: fx.memberId, key: { in: MOVEMENT_PATTERNS.map(loadMetricKey) } },
  });
  assert.equal(todas.length, 2, "solo las que se registraron: un patrón sin kilos no inventa un 0");
});

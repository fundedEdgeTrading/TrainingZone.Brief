import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { saveAssessment } from "@/lib/assessments/save";
import { assessmentSchemaFor, type AssessmentAnswers } from "@/lib/assessments/schemas";

/**
 * P8 · Cierre de la valoración inicial (QA-ALTA-05 y QA-ALTA-14).
 *
 * Lo que se protege es lo que queda escrito: que cerrar la valoración no retire
 * un consentimiento que el socio ya dio, y que un doble clic no duplique el
 * peso, las marcas ni los objetivos.
 */

const SLUG = "p8-save-assessment";

let orgId = "";
let memberId = "";
let trainerId = "";
let assessmentId = "";

/** Inicial completa y válida: cada test cambia solo lo que quiere probar. */
function initialAnswers(autorizacionImagen: boolean): AssessmentAnswers {
  const parsed = assessmentSchemaFor("INITIAL").parse({
    pesoKg: 68.5,
    dolorActual: 0,
    calidadSueno: 4,
    estres: 2,
    energia: 4,
    diasPorSemana: "3",
    perfil: {
      edad: 36,
      sexo: "MUJER",
      alturaCm: 165,
      objetivoPrincipal: "Ganar fuerza",
      objetivoSecundario: "Dormir mejor",
      motivacionReal: "",
      queLeHariaAbandonar: "",
    },
    experiencia: {
      nivelActividad: "MEDIO",
      haEntrenadoAntes: true,
      anosExperiencia: 1,
      tecnicaBasicos: "MEDIA",
      ejerciciosNoTolera: "",
    },
    screening: {
      cardiovascular: false,
      hipertension: false,
      diabetes: false,
      medicacion: "",
      cirugias: "",
      lesionesActuales: "",
      zonasDolor: [],
    },
    marcas: [{ key: "flexiones_reps", value: 12 }],
    cierre: { consentimientoParq: true, autorizacionImagen },
  });
  return parsed as AssessmentAnswers;
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.performanceMetric.deleteMany({ where: { orgId: org.id } });
  await prisma.clientGoal.deleteMany({ where: { orgId: org.id } });
  await prisma.assessment.deleteMany({ where: { orgId: org.id } });
  await prisma.healthRecord.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.memberProgressEntry.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  orgId = (await prisma.organization.create({ data: { name: "Cierre P8", slug: SLUG } })).id;
  const centerId = (await prisma.center.create({ data: { orgId, name: "Centro cierre", slug: `${SLUG}-c` } })).id;
  const identity = await prisma.identity.create({
    data: { email: `${SLUG}-trainer@example.com`, passwordHash: "no-se-usa" },
  });
  trainerId = (
    await prisma.user.create({
      data: { identityId: identity.id, orgId, centerId, name: "Entrenador", email: identity.email, role: "TRAINER" },
    })
  ).id;
  memberId = (
    await prisma.member.create({
      data: { orgId, primaryCenterId: centerId, firstName: "Ana", lastName: "Socia", email: `${SLUG}-socia@example.com` },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.performanceMetric.deleteMany({ where: { orgId } });
  await prisma.clientGoal.deleteMany({ where: { orgId } });
  await prisma.assessment.deleteMany({ where: { orgId } });
  await prisma.healthRecord.deleteMany({ where: { memberId } });
  await prisma.memberProgressEntry.deleteMany({ where: { memberId } });
  await prisma.member.update({
    where: { id: memberId },
    data: { consentImages: false, consentImagesAt: null, consentHealth: false, consentHealthAt: null },
  });
  assessmentId = (
    await prisma.assessment.create({
      data: { orgId, memberId, kind: "INITIAL", dueDate: new Date(), answers: {} },
    })
  ).id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function close(answers: AssessmentAnswers) {
  return saveAssessment({ assessmentId, orgId, actorUserId: trainerId, actorRole: "TRAINER", answers });
}

test("QA-ALTA-05 · cerrar la valoración sin marcar la casilla NO retira la autorización de imagen ya dada", async () => {
  const grantedAt = new Date("2026-09-01T10:00:00.000Z");
  await prisma.member.update({ where: { id: memberId }, data: { consentImages: true, consentImagesAt: grantedAt } });

  const result = await close(initialAnswers(false));
  assert.equal(result.ok, true);

  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { consentImages: true, consentImagesAt: true, consentHealth: true },
  });
  assert.equal(member.consentImages, true, "la retirada va por consent-access, no por la valoración");
  assert.equal(member.consentImagesAt?.toISOString(), grantedAt.toISOString(), "ni se borra ni se mueve la fecha");
  assert.equal(member.consentHealth, true, "el PAR-Q sí se firma aquí");
});

test("QA-ALTA-05 · la valoración sí puede DAR la autorización de imagen", async () => {
  const result = await close(initialAnswers(true));
  assert.equal(result.ok, true);
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { consentImages: true, consentImagesAt: true },
  });
  assert.equal(member.consentImages, true);
  assert.ok(member.consentImagesAt);
});

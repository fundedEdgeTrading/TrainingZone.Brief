import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { auditMesocycleOpened, auditSessionPainRead } from "@/lib/health-access";
import { approveMesocycle, getMesocycleDetail } from "@/lib/mesocycle-queries";

/**
 * E3-18 · Auditar la apertura de un mesociclo y purgar `aiConversation` al
 * aprobar (RB-IA-005).
 *
 * `Mesocycle.safetyCriteria` y `Mesocycle.aiConversation` —que contiene el
 * briefing íntegro con la sección "Screening clínico"— se leían sin pasar por
 * `health-access.ts` y sin escribir en `AuditLog`. El control por rol sí
 * coincidía; lo que se perdía era la traza. Esta historia añade traza, no
 * acceso.
 */

const SLUG = "e2e-mesocycle-audit-test";

type Fixture = { orgId: string; memberId: string; trainerId: string; mesocycleId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Mesociclo audit", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro audit", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Audit",
      email: `${SLUG}@example.com`,
    },
  });
  const email = `${SLUG}-trainer@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const trainer = await prisma.user.create({
    data: { orgId: org.id, identityId: identity.id, name: "Entrenador", email, role: "TRAINER" },
  });

  const mesocycle = await prisma.mesocycle.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      createdByUserId: trainer.id,
      title: "Fuerza base",
      objective: "Recuperar fuerza general",
      safetyCriteria: ["cervicales — contractura recurrente"],
      weeklyLayout: ["Lun TZ"],
      milestones: [{ week: 4, milestone: "12 flexiones" }],
      startDate: new Date(2026, 8, 7),
      aiConversation: [{ role: "user", content: "Screening clínico: hipertensión declarada" }],
      phases: {
        create: [
          {
            order: 0,
            name: "Adaptación",
            weekFrom: 1,
            weekTo: 3,
            deload: false,
            notes: null,
            days: {
              create: [
                {
                  order: 0,
                  label: "Lunes",
                  venue: "TZ",
                  focus: "Empuje",
                  warmup: ["Movilidad torácica"],
                  blocks: {
                    create: [
                      {
                        order: 0,
                        name: "Fuerza",
                        durationMin: 30,
                        exercises: {
                          create: [
                            {
                              order: 0,
                              name: "Press banca",
                              sets: 3,
                              reps: "8",
                              load: null,
                              description: "Agarre neutro",
                              rationale: "Patrón de empuje horizontal",
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  fx = { orgId: org.id, memberId: member.id, trainerId: trainer.id, mesocycleId: mesocycle.id };
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.mesocycle.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

test("E3-18 · abrir un mesociclo con criterios clínicos escribe AuditLog", async () => {
  await auditMesocycleOpened({
    mesocycleId: fx.mesocycleId,
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    clinicalCriteria: 1,
    hasAiConversation: true,
  });

  const traza = await prisma.auditLog.findFirstOrThrow({
    where: { orgId: fx.orgId, action: "MESOCYCLE_CLINICAL_OPENED", entityId: fx.mesocycleId },
  });
  assert.equal(traza.actorUserId, fx.trainerId, "actor");
  assert.equal(traza.memberId, fx.memberId, "socio");
  assert.ok(traza.createdAt instanceof Date, "momento");
});

test("E3-18 · un mesociclo sin nada clínico no ensucia el registro", async () => {
  const before = await prisma.auditLog.count({
    where: { orgId: fx.orgId, action: "MESOCYCLE_CLINICAL_OPENED" },
  });
  await auditMesocycleOpened({
    mesocycleId: fx.mesocycleId,
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    clinicalCriteria: 0,
    hasAiConversation: false,
  });
  assert.equal(
    await prisma.auditLog.count({ where: { orgId: fx.orgId, action: "MESOCYCLE_CLINICAL_OPENED" } }),
    before,
    "el registro tiene que poder leerse cuando se pregunte por un acceso de verdad"
  );
});

test("E3-18 · aprobar purga aiConversation y conserva el plan y la revisión humana", async () => {
  const result = await approveMesocycle(fx.orgId, fx.mesocycleId, fx.trainerId);
  assert.deepEqual(result, { ok: true });

  const detail = await getMesocycleDetail(fx.orgId, fx.mesocycleId);
  assert.equal(detail?.aiConversation, null, "el briefing íntegro con el screening clínico desaparece");
  assert.equal(detail?.phases.length, 1, "el plan aprobado se conserva entero");
  assert.equal(detail?.phases[0].days[0].blocks[0].exercises[0].name, "Press banca");
  assert.ok(detail?.approvedAt instanceof Date, "y la marca de revisión humana");
  assert.equal(detail?.approvedByUserId, fx.trainerId);
});

test("E3-18 · leer el dolor del debrief fuera del entrenador de la sesión deja traza", async () => {
  await auditSessionPainRead({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    source: "MEMBER_CALENDAR",
    debriefCount: 3,
  });

  const traza = await prisma.auditLog.findFirstOrThrow({
    where: { orgId: fx.orgId, action: "SESSION_DEBRIEF_PAIN_READ", memberId: fx.memberId },
  });
  assert.deepEqual(traza.metadata, { source: "MEMBER_CALENDAR", debriefCount: 3 });
});

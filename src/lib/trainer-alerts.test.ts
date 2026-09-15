import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { runFewSessionsScheduledRule, runLowPackBalanceRule } from "@/lib/trainer-alerts";
import { AUTO_TASK_CAP_ENTITY, AUTO_TASK_RULES } from "@/lib/tasks";

/**
 * E14-11 / E14-12 · las dos reglas comerciales sobre el socio, contra la base
 * real.
 *
 * **El test que faltaba** es el primero: con «pocas sesiones programadas»
 * abierta, la de bono bajo TIENE que poder crear la suya. Hasta ahora no podía
 * —las dos escribían `entityType = "Member"` y `entityId = member.id`, así que
 * `createNotificationOnce` se comía la segunda en silencio— y no había forma de
 * enterarse: la regla devolvía «he creado 84» y en la base había 42.
 *
 * Se prueba contra la base de datos y no con dobles porque lo que se rompía era
 * una CONSULTA, igual que en `no-show-alerts.test.ts`. Cada test monta su propia
 * organización y la borra al terminar: ni depende de los datos de demo ni los
 * ensucia.
 */

const SUFFIX = "test-trainer-alerts";

type Fixture = {
  orgId: string;
  centerId: string;
  memberId: string;
  directorIds: string[];
};

async function createFixture(tag: string, opts: { directors?: number; weeklyCap?: number } = {}): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({
    data: {
      name: `Trainer alerts ${tag}`,
      slug,
      ...(opts.weeklyCap !== undefined ? { autoTaskWeeklyCapPerUser: opts.weeklyCap } : {}),
    },
  });
  const center = await prisma.center.create({ data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` } });

  const directorIds: string[] = [];
  for (let i = 0; i < (opts.directors ?? 1); i++) {
    const identity = await prisma.identity.create({
      data: { email: `${slug}-dir${i}@example.com`, passwordHash: "x" },
    });
    const director = await prisma.user.create({
      data: {
        identityId: identity.id,
        orgId: org.id,
        centerId: center.id,
        name: `Dirección ${tag} ${i}`,
        email: identity.email,
        role: "CENTER_DIRECTOR",
      },
    });
    directorIds.push(director.id);
  }

  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Alertas ${tag}`,
      email: `${slug}@example.com`,
      state: "ACTIVE",
    },
  });

  return { orgId: org.id, centerId: center.id, memberId: member.id, directorIds };
}

/** Bono de sesiones con el saldo que se le pida: lo que dispara RB-RRHH-007. */
async function givePack(f: Fixture, tag: string, sessionsRemaining: number) {
  const plan = await prisma.membershipPlan.create({
    data: { orgId: f.orgId, name: `Bono ${tag}`, type: "SESSION_PACK", priceCents: 20000, sessionsIncluded: 10 },
  });
  await prisma.subscription.create({
    data: {
      memberId: f.memberId,
      planId: plan.id,
      centerId: f.centerId,
      startDate: new Date(),
      priceCents: 20000,
      sessionsIncluded: 10,
      sessionsRemaining,
      status: "ACTIVE",
    },
  });
}

/** Suscripción de entrenamiento personal: lo que mete al socio en RB-RRHH-006. */
async function givePersonalTraining(f: Fixture, tag: string) {
  const plan = await prisma.membershipPlan.create({
    data: { orgId: f.orgId, name: `EP ${tag}`, type: "PERSONAL_TRAINING", priceCents: 30000 },
  });
  await prisma.subscription.create({
    data: {
      memberId: f.memberId,
      planId: plan.id,
      centerId: f.centerId,
      startDate: new Date(),
      priceCents: 30000,
      status: "ACTIVE",
    },
  });
}

function openTasks(orgId: string, entityType: string) {
  return prisma.notification.findMany({ where: { orgId, entityType, resolvedAt: null }, select: { id: true, recipientUserId: true } });
}

async function wipe() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length === 0) return;
  await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { member: { orgId: { in: orgIds } } } });
  await prisma.member.deleteMany({ where: { orgId: { in: orgIds } } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: { in: orgIds } } });
  const users = await prisma.user.findMany({ where: { orgId: { in: orgIds } }, select: { id: true, identityId: true } });
  await prisma.user.deleteMany({ where: { orgId: { in: orgIds } } });
  await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
  await prisma.center.deleteMany({ where: { orgId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

before(wipe);
after(wipe);

test("E14-11 · con «pocas sesiones» abierta, la regla de bono bajo crea igualmente la suya", async () => {
  const f = await createFixture("colision");
  await givePersonalTraining(f, "colision");
  await givePack(f, "colision", 2);

  // Primero la que antes ganaba la carrera.
  assert.equal(await runFewSessionsScheduledRule(f.orgId), 1);
  assert.equal((await openTasks(f.orgId, AUTO_TASK_RULES.fewSessionsScheduled.entityType)).length, 1);

  // Y ahora la que más vende, con la anterior abierta sobre el MISMO socio.
  assert.equal(await runLowPackBalanceRule(f.orgId), 1, "la tarea de bono bajo se la comía el deduplicador");
  assert.equal((await openTasks(f.orgId, AUTO_TASK_RULES.lowPackBalance.entityType)).length, 1);

  // Las dos conviven: es la situación que antes era imposible.
  const delSocio = await prisma.notification.count({
    where: { orgId: f.orgId, entityId: f.memberId, resolvedAt: null },
  });
  assert.equal(delSocio, 2);
});

test("E14-11 · la deduplicación sigue haciendo su trabajo dentro de cada regla", async () => {
  const f = await createFixture("idempotente");
  await givePack(f, "idempotente", 1);

  assert.equal(await runLowPackBalanceRule(f.orgId), 1);
  assert.equal(await runLowPackBalanceRule(f.orgId), 0, "la segunda pasada no vuelve a escribir");
  assert.equal(await runLowPackBalanceRule(f.orgId), 0);
  assert.equal((await openTasks(f.orgId, AUTO_TASK_RULES.lowPackBalance.entityType)).length, 1);
});

test("E14-11 · con varias personas en dirección se escribe UNA tarea, no una por cabeza", async () => {
  const f = await createFixture("abanico", { directors: 4 });
  await givePack(f, "abanico", 2);

  await runLowPackBalanceRule(f.orgId);
  const tasks = await openTasks(f.orgId, AUTO_TASK_RULES.lowPackBalance.entityType);
  assert.equal(tasks.length, 1, "cuatro direcciones no son cuatro tareas");
  assert.ok(f.directorIds.includes(tasks[0].recipientUserId), "la tarea tiene dueño, y es de dirección");
});

test("E14-12 · el tope corta las tareas automáticas y lo dice con una sola tarea resumen", async () => {
  const f = await createFixture("tope", { weeklyCap: 1 });
  await givePersonalTraining(f, "tope");
  await givePack(f, "tope", 2);

  // La primera entra y consume el tope de la única persona de dirección.
  assert.equal(await runFewSessionsScheduledRule(f.orgId), 1);
  // La segunda ya no: no revienta, no pierde el trabajo en silencio.
  assert.equal(await runLowPackBalanceRule(f.orgId), 0);
  assert.equal((await openTasks(f.orgId, AUTO_TASK_RULES.lowPackBalance.entityType)).length, 0);

  const avisos = await openTasks(f.orgId, AUTO_TASK_CAP_ENTITY);
  assert.equal(avisos.length, 1, "el tope deja dicho que está actuando");

  // Y aunque el motor lo intente otras veces, el aviso sigue siendo UNO.
  await runLowPackBalanceRule(f.orgId);
  await runLowPackBalanceRule(f.orgId);
  assert.equal((await openTasks(f.orgId, AUTO_TASK_CAP_ENTITY)).length, 1);
});

test("E14-12 · el tope no alcanza a lo que encarga una persona", async () => {
  const f = await createFixture("manual", { weeklyCap: 1 });
  await givePack(f, "manual", 2);
  await runLowPackBalanceRule(f.orgId);

  const { createManualTask } = await import("@/lib/tasks-queries");
  for (let i = 0; i < 5; i++) {
    const result = await createManualTask({
      orgId: f.orgId,
      createdByUserId: f.directorIds[0],
      recipientUserId: f.directorIds[0],
      title: `Encargo ${i}`,
    });
    assert.equal(result.ok, true, "una tarea que encarga una persona no se limita nunca");
  }

  const manuales = await prisma.notification.count({
    where: { orgId: f.orgId, createdByUserId: { not: null }, resolvedAt: null },
  });
  assert.equal(manuales, 5);
});

test("E14-12 · con hueco en otra persona, el trabajo cae donde cabe", async () => {
  const f = await createFixture("reparto", { directors: 2, weeklyCap: 1 });
  await givePersonalTraining(f, "reparto");
  await givePack(f, "reparto", 2);

  await runFewSessionsScheduledRule(f.orgId);
  await runLowPackBalanceRule(f.orgId);

  const pocas = await openTasks(f.orgId, AUTO_TASK_RULES.fewSessionsScheduled.entityType);
  const bono = await openTasks(f.orgId, AUTO_TASK_RULES.lowPackBalance.entityType);
  assert.equal(pocas.length, 1);
  assert.equal(bono.length, 1, "la segunda no se pierde: la coge la otra dirección, que tiene sitio");
  assert.notEqual(pocas[0].recipientUserId, bono[0].recipientUserId);
  assert.equal((await openTasks(f.orgId, AUTO_TASK_CAP_ENTITY)).length, 0, "nadie ha llegado al tope");
});

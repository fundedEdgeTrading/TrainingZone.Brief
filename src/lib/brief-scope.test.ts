import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { briefScopeWhere, getSessionBrief } from "@/lib/brief-queries";

/**
 * E1-01 (RB-SEG-001): el Session Brief solo abre sesiones del ámbito de centro
 * de quien lo pide.
 *
 * El hallazgo que se cierra aquí está verificado contra la aplicación
 * levantada, no inferido: la dirección de un centro recibía las sesiones de los
 * tres centros de la organización y leía la lesión de un socio de otro centro
 * con `canSeeHealth: true` y una entrada de AuditLog que la daba por lectura
 * legítima. Por eso el test no se conforma con el `null`: comprueba también que
 * NO queda rastro en AuditLog, que es la parte que convertía una fuga en una
 * fuga documentada como correcta.
 *
 * Se prueba contra la base de datos real porque lo que falla es un `where` y el
 * cruce con `CenterMembership`, no una función pura.
 */

const SUFFIX = "test-brief-scope";

type Fixture = {
  orgId: string;
  centerA: string;
  centerB: string;
  sessionA: string;
  sessionB: string;
  memberB: string;
  directorA: { id: string; role: "CENTER_DIRECTOR"; orgId: string; centerId: string };
  owner: { id: string; role: "OWNER"; orgId: string; centerId: null };
  trainerAB: { id: string; role: "TRAINER"; orgId: string; centerId: string };
};
let fx: Fixture;

async function makeUser(orgId: string, tag: string, role: "OWNER" | "CENTER_DIRECTOR" | "TRAINER", centerId: string | null) {
  const email = `${SUFFIX}-${tag}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
  return prisma.user.create({
    data: { orgId, identityId: identity.id, name: tag, email, role, centerId },
  });
}

/** Una sesión con una persona apuntada; el socio arrastra una lesión abierta. */
async function makeSessionWithMember(orgId: string, centerId: string, tag: string, trainerId: string) {
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: "Socio",
      lastName: tag,
      email: `${SUFFIX}-${tag}-socio@example.com`,
      state: "ACTIVE",
    },
  });
  await prisma.healthRecord.create({
    data: {
      memberId: member.id,
      type: "INJURY",
      zone: "cervicales",
      description: "molestia crónica",
      severity: "MEDIUM",
      status: "ACTIVE",
    },
  });
  const day = new Date(2026, 0, 12);
  const session = await prisma.classSession.create({
    data: {
      orgId,
      centerId,
      trainerId,
      name: `Sesión ${tag}`,
      classType: "Grupo reducido",
      date: day,
      startTime: "10:00",
      endTime: "11:00",
      capacity: 6,
    },
  });
  await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, status: "BOOKED", occurrenceDate: day },
  });
  return { sessionId: session.id, memberId: member.id };
}

/** Borra lo que este fichero siembra. Se llama antes y después: un fallo a
 * medias no puede dejar la organización bloqueando la siguiente ejecución. */
async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.booking.deleteMany({ where: { session: { orgId } } });
    await prisma.classSession.deleteMany({ where: { orgId } });
    await prisma.healthRecord.deleteMany({ where: { member: { orgId } } });
    await prisma.member.deleteMany({ where: { orgId } });
    await prisma.centerMembership.deleteMany({ where: { orgId } });
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  await wipe();
  const org = await prisma.organization.create({
    data: { name: "Brief scope", slug: SUFFIX, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const centerA = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SUFFIX}-a` } });
  const centerB = await prisma.center.create({ data: { orgId: org.id, name: "Santander", slug: `${SUFFIX}-b` } });

  const director = await makeUser(org.id, "director-a", "CENTER_DIRECTOR", centerA.id);
  const owner = await makeUser(org.id, "owner", "OWNER", null);
  // Entrenador imputado a los DOS centros: su ámbito sale de CenterMembership,
  // no solo de su centro base.
  const trainer = await makeUser(org.id, "trainer-ab", "TRAINER", centerA.id);
  await prisma.centerMembership.createMany({
    data: [
      { orgId: org.id, userId: trainer.id, centerId: centerA.id, role: "TRAINER", isPrimary: true },
      { orgId: org.id, userId: trainer.id, centerId: centerB.id, role: "TRAINER" },
    ],
  });

  const a = await makeSessionWithMember(org.id, centerA.id, "a", trainer.id);
  const b = await makeSessionWithMember(org.id, centerB.id, "b", trainer.id);

  fx = {
    orgId: org.id,
    centerA: centerA.id,
    centerB: centerB.id,
    sessionA: a.sessionId,
    sessionB: b.sessionId,
    memberB: b.memberId,
    directorA: { id: director.id, role: "CENTER_DIRECTOR", orgId: org.id, centerId: centerA.id },
    owner: { id: owner.id, role: "OWNER", orgId: org.id, centerId: null },
    trainerAB: { id: trainer.id, role: "TRAINER", orgId: org.id, centerId: centerA.id },
  };
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

function briefFor(actor: { id: string; role: Fixture["directorA"]["role"] | "OWNER" | "TRAINER"; centerId: string | null }, sessionId: string) {
  return getSessionBrief({
    orgId: fx.orgId,
    sessionId,
    actorUserId: actor.id,
    actorRole: actor.role,
    actorCenterId: actor.centerId,
  });
}

test("E1-01 · una sesión fuera del ámbito de centro devuelve null y no deja rastro en AuditLog", async () => {
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });

  const brief = await briefFor(fx.directorA, fx.sessionB);
  assert.equal(brief, null, "la dirección de La Jota no abre una sesión de Santander");

  // El escenario dice literalmente "no se escribe ninguna entrada de lectura":
  // el acceso denegado no puede quedar anotado como lectura legítima de salud.
  const audit = await prisma.auditLog.findMany({ where: { orgId: fx.orgId, action: "SESSION_BRIEF_OPENED" } });
  assert.deepEqual(audit, [], "un brief denegado no escribe SESSION_BRIEF_OPENED");
});

test("E1-01 · la sesión de su propio centro se sigue abriendo igual que hoy", async () => {
  const brief = await briefFor(fx.directorA, fx.sessionA);
  assert.ok(brief, "la sesión de su centro se abre");
  assert.equal(brief.roster.length, 1);
  assert.equal(brief.canSeeHealth, true);

  const audit = await prisma.auditLog.findMany({
    where: { orgId: fx.orgId, action: "SESSION_BRIEF_OPENED", entityId: fx.sessionA },
  });
  assert.equal(audit.length, 1, "la lectura legítima sí se audita");
});

test("E1-01 · un entrenador imputado a dos centros ve los briefs de los dos", async () => {
  assert.ok(await briefFor(fx.trainerAB, fx.sessionA));
  assert.ok(await briefFor(fx.trainerAB, fx.sessionB));
});

test("E1-01 · la dirección de organización ve toda su organización", async () => {
  assert.ok(await briefFor(fx.owner, fx.sessionA));
  assert.ok(await briefFor(fx.owner, fx.sessionB));
});

test("E1-01 · el índice se acota con el mismo criterio que el detalle", async () => {
  // Sin frontera para la dirección de organización; con ella para el resto.
  assert.deepEqual(await briefScopeWhere(fx.owner), {});
  assert.deepEqual(await briefScopeWhere(fx.directorA), { centerId: { in: [fx.centerA] } });

  const trainerScope = await briefScopeWhere(fx.trainerAB);
  const centers = (trainerScope.centerId as { in: string[] }).in;
  assert.deepEqual([...centers].sort(), [fx.centerA, fx.centerB].sort());

  // Y el recuento del índice coincide con lo que el detalle deja abrir.
  const listed = await prisma.classSession.findMany({
    where: { orgId: fx.orgId, ...(await briefScopeWhere(fx.directorA)) },
    select: { id: true },
  });
  assert.deepEqual(listed.map((s) => s.id), [fx.sessionA]);
});

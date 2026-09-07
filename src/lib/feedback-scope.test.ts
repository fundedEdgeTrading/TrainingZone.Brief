import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getWeeklyDebriefReport } from "@/lib/brief-queries";
import {
  getMemberFeedbackDetail,
  listCentersForFeedback,
  listMemberFeedback,
} from "@/lib/feedback-queries";
import type { ScopedUser } from "@/lib/center-scope";

/**
 * E1-03 (RB-SEG-003): `/feedback`, `/feedback/[id]` y `/feedback/debriefs-semanales`
 * respetan el ámbito de centro.
 *
 * El fallo no era la falta de un filtro, era **qué significaba el filtro**:
 * `centerId` era un facet que elegía el usuario, no una frontera. Sin filtro,
 * la dirección de un centro leía las notas de debrief —texto libre del
 * entrenador sobre cada socio— de toda la organización, y el informe semanal
 * agregaba sesiones que esa persona no dirige.
 */

const SUFFIX = "test-feedback-scope";

type Fixture = {
  orgId: string;
  laJota: string;
  santander: string;
  memberA: string;
  memberB: string;
  director: ScopedUser;
  owner: ScopedUser;
};
let fx: Fixture;

const DIMS = {
  sat: 8,
  prog: 7,
  adher: 8,
  motiv: 9,
  esf: 7,
  descanso: 6,
  nutricion: 7,
  bienestar: 8,
  comunicacion: 9,
};

const WEEK_START = new Date(2026, 0, 12); // lunes
const PERIOD = "2026-01";

/**
 * Un socio con lo que la pantalla necesita para considerarlo candidato: una
 * sesión de EP asistida, su feedback y el debrief de su entrenador — con nota,
 * que es lo confidencial que se estaba cruzando entre centros.
 */
async function makeMemberWithFeedback(centerId: string, tag: string, trainerId: string) {
  const member = await prisma.member.create({
    data: {
      orgId: fx.orgId,
      primaryCenterId: centerId,
      firstName: "Socio",
      lastName: tag,
      email: `${SUFFIX}-${tag}@example.com`,
      state: "ACTIVE",
    },
  });
  const session = await prisma.classSession.create({
    data: {
      orgId: fx.orgId,
      centerId,
      trainerId,
      name: `EP ${tag}`,
      classType: "Personal Training",
      date: WEEK_START,
      startTime: "10:00",
      endTime: "11:00",
      capacity: 1,
    },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, status: "ATTENDED", occurrenceDate: WEEK_START },
  });
  await prisma.sessionDebrief.create({
    data: { bookingId: booking.id, feeling: "GREEN", note: `nota confidencial de ${tag}` },
  });
  await prisma.clientFeedback.create({
    data: { orgId: fx.orgId, memberId: member.id, periodKey: PERIOD, ...DIMS },
  });
  await prisma.trainerDebrief.create({
    data: {
      orgId: fx.orgId,
      memberId: member.id,
      trainerId,
      periodKey: PERIOD,
      ...DIMS,
      note: `debrief confidencial de ${tag}`,
    },
  });
  return member.id;
}

async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    await prisma.sessionDebrief.deleteMany({ where: { booking: { session: { orgId } } } });
    await prisma.booking.deleteMany({ where: { session: { orgId } } });
    await prisma.classSession.deleteMany({ where: { orgId } });
    await prisma.trainerDebrief.deleteMany({ where: { orgId } });
    await prisma.clientFeedback.deleteMany({ where: { orgId } });
    await prisma.member.deleteMany({ where: { orgId } });
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
    data: { name: "Feedback", slug: SUFFIX, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const laJota = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SUFFIX}-a` } });
  const santander = await prisma.center.create({ data: { orgId: org.id, name: "Santander", slug: `${SUFFIX}-b` } });

  const makeUser = async (tag: string, role: "OWNER" | "CENTER_DIRECTOR" | "TRAINER", centerId: string | null) => {
    const identity = await prisma.identity.create({
      data: { email: `${SUFFIX}-${tag}@example.com`, passwordHash: "x" },
    });
    return prisma.user.create({
      data: { orgId: org.id, identityId: identity.id, name: tag, email: identity.email, role, centerId },
    });
  };
  const director = await makeUser("director", "CENTER_DIRECTOR", laJota.id);
  const owner = await makeUser("owner", "OWNER", null);
  const trainerA = await makeUser("trainer-a", "TRAINER", laJota.id);
  const trainerB = await makeUser("trainer-b", "TRAINER", santander.id);

  fx = {
    orgId: org.id,
    laJota: laJota.id,
    santander: santander.id,
    memberA: "",
    memberB: "",
    director: { id: director.id, role: "CENTER_DIRECTOR", orgId: org.id, centerId: laJota.id },
    owner: { id: owner.id, role: "OWNER", orgId: org.id, centerId: null },
  };
  fx.memberA = await makeMemberWithFeedback(laJota.id, "jota", trainerA.id);
  fx.memberB = await makeMemberWithFeedback(santander.id, "santander", trainerB.id);
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("E1-03 · el listado sin filtro de centro ya viene acotado al ámbito", async () => {
  const rows = await listMemberFeedback(fx.director);
  assert.deepEqual(
    rows.map((r) => r.memberId),
    [fx.memberA],
    "sin filtro NO es 'toda la organización': es 'todos mis centros'"
  );
  assert.equal(rows[0].centerId, fx.laJota);
});

test("E1-03 · el selector de centro solo ofrece los centros del ámbito", async () => {
  const centers = await listCentersForFeedback(fx.director);
  assert.deepEqual(
    centers.map((c) => c.id),
    [fx.laJota]
  );
});

test("E1-03 · el detalle por URL directa de un socio de otro centro devuelve null", async () => {
  assert.equal(await getMemberFeedbackDetail(fx.director, fx.memberB), null);

  // Y el suyo se sigue abriendo, con las dos caras del contraste.
  const own = await getMemberFeedbackDetail(fx.director, fx.memberA);
  assert.ok(own);
  assert.ok(own.debrief, "el debrief de su propio socio sí se ve");
});

test("E1-03 · el informe semanal agrega solo las sesiones del ámbito", async () => {
  const report = await getWeeklyDebriefReport(fx.director, WEEK_START);
  const sessions = report.flatMap((t) => t.sessions);
  assert.equal(sessions.length, 1, "el total coincide con su agenda de esa semana");
  assert.deepEqual(sessions[0].notes, ["nota confidencial de jota"]);
});

test("E1-03 · la dirección de organización sigue viendo toda la organización", async () => {
  const rows = await listMemberFeedback(fx.owner);
  assert.deepEqual([...rows.map((r) => r.memberId)].sort(), [fx.memberA, fx.memberB].sort());

  assert.equal((await listCentersForFeedback(fx.owner)).length, 2);
  assert.ok(await getMemberFeedbackDetail(fx.owner, fx.memberB));

  const sessions = (await getWeeklyDebriefReport(fx.owner, WEEK_START)).flatMap((t) => t.sessions);
  assert.equal(sessions.length, 2);
});

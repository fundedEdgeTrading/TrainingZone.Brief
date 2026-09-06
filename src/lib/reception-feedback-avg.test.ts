import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-auth";
import { debriefAverage } from "@/app/api/mobile/v1/_lib/calendar";
import { GET as memberRoute } from "@/app/api/mobile/v1/members/[id]/route";
import { GET as calendarRoute } from "@/app/api/mobile/v1/members/[id]/calendar/route";

/**
 * E1-06 (RB-SEG-004): recepción deja de recibir `feedbackAvg`.
 *
 * `debriefAverage` promedia técnica, actitud, energía, **movilidad** y **dolor
 * invertido**, y la matriz de permisos excluye a recepción de los datos de
 * salud (`canViewHealthData`, rbac.ts). Con el seed actual salía `null` porque
 * nadie había puntuado ejes todavía, así que el fallo no se veía: la ruta de
 * escritura estaba viva y bastaba un debrief real para exponerlo. Por eso este
 * test PUNTÚA los ejes antes de mirar.
 *
 * Y no basta con que el valor sea `null`: la clave no puede estar. Un `null`
 * declarado ya dice que el dato existe y que quien pregunta simplemente no lo
 * recibe hoy.
 */

const SUFFIX = "test-reception-feedback-avg";

type Fixture = { orgId: string; centerId: string; memberId: string; directorId: string; receptionId: string };
let fx: Fixture;

async function callAs(
  handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  path: string,
  userId: string,
  role: Role
) {
  const token = await signAccessToken({ sub: userId, role, orgId: fx.orgId, centerId: fx.centerId });
  const res = await handler(
    new NextRequest(`http://localhost/api/mobile/v1/members/${fx.memberId}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ id: fx.memberId }) }
  );
  assert.equal(res.status, 200);
  return (await res.json()).data;
}

/** Las claves que componen la media, tal y como podrían colarse en el payload. */
const DIMENSION_KEYS = ["technique", "attitude", "energy", "mobility", "pain", "adherence", "progress", "rpe"];

function assertNoHealthKeys(entries: Record<string, unknown>[]) {
  for (const entry of entries) {
    assert.ok(!("feedbackAvg" in entry), "la clave feedbackAvg no puede estar, ni siquiera a null");
    for (const key of DIMENSION_KEYS) {
      assert.ok(!(key in entry), `tampoco la dimensión ${key}`);
    }
  }
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
    data: { name: "Recepción", slug: SUFFIX, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SUFFIX}-a` } });

  const makeUser = async (tag: string, role: Role) => {
    const identity = await prisma.identity.create({
      data: { email: `${SUFFIX}-${tag}@example.com`, passwordHash: "x" },
    });
    return prisma.user.create({
      data: { orgId: org.id, identityId: identity.id, name: tag, email: identity.email, role, centerId: center.id },
    });
  };
  const director = await makeUser("director", "CENTER_DIRECTOR");
  const reception = await makeUser("recepcion", "RECEPTION");

  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Puntuado",
      email: `${SUFFIX}-socio@example.com`,
      state: "ACTIVE",
    },
  });
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      trainerId: director.id,
      name: "EP",
      classType: "Personal Training",
      date: day,
      startTime: "10:00",
      endTime: "11:00",
      capacity: 1,
    },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, status: "ATTENDED", occurrenceDate: day },
  });
  // Ejes puntuados de verdad: con el seed vacío la media salía `null` y la fuga
  // pasaba desapercibida.
  await prisma.sessionDebrief.create({
    data: {
      bookingId: booking.id,
      feeling: "AMBER",
      technique: 7,
      attitude: 8,
      energy: 6,
      mobility: 4,
      pain: 7,
      adherence: 8,
      progress: 6,
    },
  });

  fx = {
    orgId: org.id,
    centerId: center.id,
    memberId: member.id,
    directorId: director.id,
    receptionId: reception.id,
  };
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("E1-06 · la media del debrief no es cero por accidente: hay ejes puntuados", () => {
  // Si esto fuera `null`, el resto del fichero pasaría sin probar nada.
  assert.ok(
    debriefAverage({
      rpe: null,
      technique: 7,
      attitude: 8,
      energy: 6,
      mobility: 4,
      pain: 7,
      adherence: 8,
      progress: 6,
    }) != null
  );
});

test("E1-06 · GET /members/[id] no manda feedbackAvg a recepción", async () => {
  const data = await callAs(memberRoute, "", fx.receptionId, "RECEPTION");
  assertNoHealthKeys([...data.upcoming, ...data.recent]);
  assert.ok(data.recent.length > 0, "hay una sesión asistida que mirar");
});

test("E1-06 · GET /members/[id]/calendar tampoco", async () => {
  const data = await callAs(calendarRoute, "/calendar", fx.receptionId, "RECEPTION");
  assert.ok(data.entries.length > 0);
  assertNoHealthKeys(data.entries);
});

test("E1-06 · dirección de centro sigue recibiendo la media con normalidad", async () => {
  const detail = await callAs(memberRoute, "", fx.directorId, "CENTER_DIRECTOR");
  const entry = detail.recent[0];
  assert.ok("feedbackAvg" in entry);
  assert.equal(typeof entry.feedbackAvg, "number");

  const calendar = await callAs(calendarRoute, "/calendar", fx.directorId, "CENTER_DIRECTOR");
  assert.equal(typeof calendar.entries[0].feedbackAvg, "number");
});

import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { feelingOrigin, setSessionDebrief } from "@/lib/session-debrief";

/**
 * E3-07 · Un único canal de debrief: 🟢🟡🔴 puesto por el entrenador.
 *
 * Había tres escritores de `SessionDebrief` con dos criterios de `feeling`
 * incompatibles. El peor caso no era la contradicción, sino el silencio:
 * rellenar solo el RPE dejaba la media a `null`, la derivación devolvía AMBER y
 * el socio quedaba marcado "regular" sin que nadie lo hubiera dicho.
 */

const SLUG = "e2e-session-debrief-test";

type Fixture = {
  orgId: string;
  centerId: string;
  memberId: string;
  trainerId: string;
  otherTrainerId: string;
  sessionId: string;
  bookingId: string;
};
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Debrief", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro debrief", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Debrief",
      email: `${SLUG}@example.com`,
    },
  });
  const makeUser = async (tag: string) => {
    const email = `${SLUG}-${tag}@example.com`;
    const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
    return prisma.user.create({
      data: { orgId: org.id, identityId: identity.id, name: tag, email, role: "TRAINER" },
    });
  };
  const trainer = await makeUser("trainer");
  const otherTrainer = await makeUser("otro");

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
      trainerId: trainer.id,
    },
  });
  const booking = await prisma.booking.create({
    data: { sessionId: session.id, memberId: member.id, occurrenceDate: session.date, status: "BOOKED" },
  });

  fx = {
    orgId: org.id,
    centerId: center.id,
    memberId: member.id,
    trainerId: trainer.id,
    otherTrainerId: otherTrainer.id,
    sessionId: session.id,
    bookingId: booking.id,
  };
});

after(async () => {
  if (!fx) return;
  await prisma.sessionDebrief.deleteMany({ where: { booking: { sessionId: fx.sessionId } } });
  await prisma.booking.deleteMany({ where: { sessionId: fx.sessionId } });
  await prisma.classSession.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

test("E3-07 · un toque guarda color y frase, y marca la asistencia", async () => {
  const result = await setSessionDebrief({
    bookingId: fx.bookingId,
    sessionId: fx.sessionId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    actorCenterId: fx.centerId,
    feeling: "RED",
    note: "  Se ha quejado del hombro al empujar  ",
  });

  assert.deepEqual(result, { ok: true });

  const debrief = await prisma.sessionDebrief.findUniqueOrThrow({ where: { bookingId: fx.bookingId } });
  assert.equal(debrief.feeling, "RED", "el color lo pone el dedo del entrenador");
  assert.equal(debrief.note, "Se ha quejado del hombro al empujar");
  assert.equal(debrief.rpe, null, "el debrief de sala ya no puntúa ejes");

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: fx.bookingId } });
  assert.equal(booking.status, "ATTENDED");
});

test("E3-07 · repetir el gesto cambia el color sin borrar la frase", async () => {
  await setSessionDebrief({
    bookingId: fx.bookingId,
    sessionId: fx.sessionId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    actorCenterId: fx.centerId,
    feeling: "AMBER",
  });

  const debrief = await prisma.sessionDebrief.findUniqueOrThrow({ where: { bookingId: fx.bookingId } });
  assert.equal(debrief.feeling, "AMBER");
  assert.equal(debrief.note, "Se ha quejado del hombro al empujar", "no mandar nota no es borrarla");
});

test("E3-07 · otro entrenador no escribe el debrief de una sesión que no dirige", async () => {
  const result = await setSessionDebrief({
    bookingId: fx.bookingId,
    sessionId: fx.sessionId,
    orgId: fx.orgId,
    actorUserId: fx.otherTrainerId,
    actorRole: "TRAINER",
    actorCenterId: fx.centerId,
    feeling: "GREEN",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 403);
});

test("E3-07/E2-02 · el canal único lleva dentro la máquina de estados de la reserva", async () => {
  // Al fundir los tres escritores en uno, RB-RES-010 tiene que viajar DENTRO:
  // si viviera en cada llamante, la app volvería a poder saltárselo. El fallo se
  // verificó justo así — `POST …/debrief` sobre una reserva cancelada respondía
  // `{"saved":true}` y la dejaba en ATTENDED.
  const cancelada = await prisma.booking.create({
    data: {
      sessionId: fx.sessionId,
      memberId: fx.memberId,
      occurrenceDate: new Date(),
      status: "CANCELLED",
    },
  });

  const result = await setSessionDebrief({
    bookingId: cancelada.id,
    sessionId: fx.sessionId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    actorCenterId: fx.centerId,
    feeling: "GREEN",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 409, "la petición es correcta; lo que no encaja es el estado");

  const sinTocar = await prisma.booking.findUniqueOrThrow({ where: { id: cancelada.id } });
  assert.equal(sinTocar.status, "CANCELLED", "no se escribe nada: ni el estado ni el debrief");
  assert.equal(await prisma.sessionDebrief.count({ where: { bookingId: cancelada.id } }), 0);
});

test("E3-07 · feelingFor deja de existir: nadie deriva el color de una media", () => {
  const source = readFileSync("src/app/api/mobile/v1/trainer/sessions/[id]/feedback/route.ts", "utf8");
  assert.ok(!/function feelingFor/.test(source), "el endpoint de ocho ejes ya no calcula el feeling");
  assert.match(source, /410/, "responde 410 con el motivo, no un 404 que parezca una caída");
});

test("E3-07 · el histórico se conserva, marcado con el origen de su feeling", () => {
  // Un debrief con ejes puntuados solo lo pudo escribir el endpoint retirado.
  assert.equal(feelingOrigin({ technique: 9, progress: 9 }), "DERIVED");
  // El caso que dejaba a un socio "regular" para siempre: solo RPE, media null.
  assert.equal(feelingOrigin({ rpe: 7 }), "DERIVED");
  assert.equal(feelingOrigin({ rpe: null, technique: null }), "TRAINER");
  assert.equal(feelingOrigin(null), "TRAINER");
});

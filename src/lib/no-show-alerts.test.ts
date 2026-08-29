import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { NoShowReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markBookingNoShow, clearBookingNoShow } from "@/lib/agenda-queries";
import { notifyConsecutiveNoShows, runConsecutiveNoShowsRule, NO_SHOW_STREAK_ENTITY } from "@/lib/no-show-alerts";

/**
 * RB-RES-009: marcar "No asistió" mueve dos cosas que solo existen en la base
 * de datos —el saldo del bono y la bandeja de dirección—, así que se prueba
 * contra la real, como los reconciliadores de Stripe (member-billing.test.ts).
 *
 * Lo que se fija aquí es el cambio de comportamiento: antes una falta NUNCA
 * devolvía la sesión y no dejaba rastro del motivo; ahora la devolución es una
 * decisión del entrenador falta a falta, y tres plantones seguidos avisan a
 * dirección. La aritmética de la racha (qué motivo corta y cuál cuenta) vive en
 * no-show.test.ts, sin base de datos.
 *
 * Cada test monta su propia organización y la borra al terminar, así que no
 * depende de los datos de demo ni los ensucia.
 */

const SUFFIX = "test-no-show";

type Fixture = {
  orgId: string;
  memberId: string;
  centerId: string;
  sessionId: string;
  subscriptionId: string;
  directorId: string;
};

/** Organización mínima: dirección, un socio con bono de sesiones y una sesión con su reserva. */
async function createFixture(tag: string, sessionsRemaining: number | null = 5): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `No-show ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const identity = await prisma.identity.create({
    data: { email: `${slug}-director@example.com`, passwordHash: "x" },
  });
  const director = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: org.id,
      centerId: center.id,
      name: `Dirección ${tag}`,
      email: identity.email,
      role: "CENTER_DIRECTOR",
    },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Bono ${tag}`, type: "SESSION_PACK", priceCents: 20000, sessionsIncluded: 10 },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `No-show ${tag}`,
      email: `${slug}@example.com`,
      state: "ACTIVE",
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 20000,
      sessionsIncluded: 10,
      sessionsRemaining,
    },
  });
  const day = new Date(2026, 0, 12);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: `EP ${tag}`,
      classType: "Personal Training",
      date: day,
      startTime: "10:00",
      endTime: "11:00",
      capacity: 1,
    },
  });

  return {
    orgId: org.id,
    memberId: member.id,
    centerId: center.id,
    sessionId: session.id,
    subscriptionId: subscription.id,
    directorId: director.id,
  };
}

/** Una reserva más en la misma sesión, para poder encadenar varias faltas. */
async function addBooking(f: Fixture, dayOffset: number, withSubscription = true) {
  return prisma.booking.create({
    data: {
      sessionId: f.sessionId,
      memberId: f.memberId,
      status: "BOOKED",
      occurrenceDate: new Date(2026, 0, 12 + dayOffset),
      subscriptionId: withSubscription ? f.subscriptionId : null,
    },
  });
}

async function remainingSessions(f: Fixture) {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  return sub.sessionsRemaining;
}

async function streakNotifications(f: Fixture) {
  return prisma.notification.findMany({
    where: { orgId: f.orgId, entityType: NO_SHOW_STREAK_ENTITY, entityId: f.memberId },
  });
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.notification.deleteMany({ where: { orgId: org.id } });
    await prisma.booking.deleteMany({ where: { session: { orgId: org.id } } });
    await prisma.classSession.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { id: true, identityId: true } });
    await prisma.user.deleteMany({ where: { orgId: org.id } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const REASONS: NoShowReason[] = ["FORGOT", "LATE_NOTICE", "JUSTIFIED", "OUR_ERROR"];

for (const reason of REASONS) {
  test(`la falta se registra con el motivo ${reason} y sin tocar el bono si no se devuelve`, async () => {
    const f = await createFixture(`motivo-${reason.toLowerCase()}`);
    const booking = await addBooking(f, 0);

    const result = await markBookingNoShow(f.orgId, booking.id, {
      sessionId: f.sessionId,
      reason,
      refundSession: false,
    });

    assert.equal(result.ok, true);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.equal(after.status, "NO_SHOW");
    assert.equal(after.noShowReason, reason, "el motivo elegido tiene que quedar guardado tal cual");
    assert.equal(after.noShowRefunded, false);
    assert.equal(await remainingSessions(f), 5, "sin devolución explícita el bono no se toca");
  });
}

test("devolver la sesión suma una al bono del que salió la reserva", async () => {
  const f = await createFixture("devuelve");
  const booking = await addBooking(f, 0);

  const result = await markBookingNoShow(f.orgId, booking.id, {
    sessionId: f.sessionId,
    reason: "JUSTIFIED",
    refundSession: true,
  });

  assert.equal(result.ok && result.refunded, true);
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  assert.equal(after.noShowRefunded, true);
  assert.equal(await remainingSessions(f), 6, "la devolución usa el mismo saldo que una cancelación (RB-RES-006)");
});

test("marcar dos veces la misma falta no devuelve la sesión dos veces", async () => {
  // El entrenador corrige el motivo sin querer devolver otra vez: el saldo es
  // dinero, y volver a pulsar no puede regalar sesiones.
  const f = await createFixture("idempotente");
  const booking = await addBooking(f, 0);

  await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason: "FORGOT", refundSession: true });
  await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason: "JUSTIFIED", refundSession: true });

  const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  assert.equal(after.noShowReason, "JUSTIFIED", "el motivo sí se corrige");
  assert.equal(await remainingSessions(f), 6, "pero la sesión solo vuelve una vez");
});

test("una reserva sin bono (cuota ilimitada) admite la falta pero no devuelve nada", async () => {
  const f = await createFixture("sin-bono");
  const booking = await addBooking(f, 0, false);

  const result = await markBookingNoShow(f.orgId, booking.id, {
    sessionId: f.sessionId,
    reason: "FORGOT",
    refundSession: true,
  });

  assert.equal(result.ok && result.refunded, false);
  assert.equal(await remainingSessions(f), 5);
});

test("rectificar una falta devuelta vuelve a descontar la sesión", async () => {
  const f = await createFixture("rectifica");
  const booking = await addBooking(f, 0);

  await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason: "FORGOT", refundSession: true });
  assert.equal(await remainingSessions(f), 6);

  await clearBookingNoShow(f.orgId, booking.id, "ATTENDED");

  const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  assert.equal(after.status, "ATTENDED");
  assert.equal(after.noShowReason, null);
  assert.equal(after.noShowRefunded, false);
  assert.equal(await remainingSessions(f), 5, "si asistió, la sesión está consumida: no puede quedarse devuelta");
});

test("tres faltas seguidas sin avisar abren una tarea a dirección", async () => {
  const f = await createFixture("racha");
  for (let i = 0; i < 3; i++) {
    const booking = await addBooking(f, i);
    await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason: "FORGOT", refundSession: false });
  }

  const created = await notifyConsecutiveNoShows(f.orgId, f.memberId);
  assert.equal(created, 1, "una tarea por cada persona de dirección de la organización");

  const notifications = await streakNotifications(f);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].recipientUserId, f.directorId);
  assert.match(notifications[0].title, /3 faltas seguidas sin avisar/);
});

test("dos faltas seguidas todavía no molestan a dirección", async () => {
  const f = await createFixture("dos-faltas");
  for (let i = 0; i < 2; i++) {
    const booking = await addBooking(f, i);
    await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason: "FORGOT", refundSession: false });
  }

  assert.equal(await notifyConsecutiveNoShows(f.orgId, f.memberId), 0);
  assert.equal((await streakNotifications(f)).length, 0);
});

test("una falta avisada en medio de tres deja el aviso sin disparar", async () => {
  const f = await createFixture("avisada");
  const reasons: NoShowReason[] = ["FORGOT", "LATE_NOTICE", "FORGOT"];
  for (const [i, reason] of reasons.entries()) {
    const booking = await addBooking(f, i);
    await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason, refundSession: false });
  }

  assert.equal(await notifyConsecutiveNoShows(f.orgId, f.memberId), 0);
  assert.equal((await streakNotifications(f)).length, 0);
});

test("la racha no reabre una tarea que dirección todavía no ha resuelto", async () => {
  const f = await createFixture("sin-duplicar");
  for (let i = 0; i < 3; i++) {
    const booking = await addBooking(f, i);
    await markBookingNoShow(f.orgId, booking.id, { sessionId: f.sessionId, reason: "FORGOT", refundSession: false });
  }

  await notifyConsecutiveNoShows(f.orgId, f.memberId);
  await notifyConsecutiveNoShows(f.orgId, f.memberId);

  assert.equal((await streakNotifications(f)).length, 1, "createNotificationOnce mantiene una sola tarea abierta");
});

test("la pasada del cron encuentra la racha aunque nadie la haya revisado al marcar", async () => {
  const f = await createFixture("cron");
  for (let i = 0; i < 3; i++) {
    const booking = await addBooking(f, i);
    // Se escribe la falta directamente, saltándose el aviso que dispara la
    // acción de agenda: es el hueco que la regla del cron tapa.
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "NO_SHOW", noShowReason: "FORGOT" },
    });
  }

  const created = await runConsecutiveNoShowsRule(f.orgId);
  assert.equal(created, 1);
  assert.equal((await streakNotifications(f)).length, 1);
});

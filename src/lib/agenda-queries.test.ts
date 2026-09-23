import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  bookSessionForMemberAsStaff,
  cancelSessionBooking,
  createEpSlot,
  deleteSession,
  saveSession,
  staffCancellationEffect,
} from "@/lib/agenda-queries";
import { CANCEL_WINDOW_HOURS } from "@/lib/portal-queries";
import {
  balanceOf,
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  createRegressionSession,
  type RegressionMember,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * Pista agenda-staff (QA-RES-*): lo que la agenda de staff hace con el bono, el
 * aforo y el calendario cuando reserva, cancela, mueve o borra en nombre de
 * otro. Contra Postgres real, como `agenda-booking.test.ts`: lo que se protege
 * es lo que queda escrito (saldo, asiento del libro, filas de reserva), y eso
 * con un doble de la base no se ve.
 */

const TAG = "qa-res-staff";
let org: RegressionOrg;
let epPlanId: string;
let counter = 0;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  // `createRegressionSession` compone la hora de comienzo con la zona del
  // proceso; con el centro en otra zona, "dentro de una hora" caía en el
  // pasado. Las ventanas se miden bien solo si las dos coinciden.
  org = await createRegressionOrg(TAG, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.orgId, name: `Bono EP ${TAG}`, type: "PERSONAL_TRAINING", sessionsIncluded: 10, priceCents: 9000 },
  });
  epPlanId = plan.id;
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

/** Socio con bono de EP (el fixture común solo da bono de grupos). */
async function epMember(sessionsRemaining: number | null): Promise<RegressionMember> {
  counter++;
  const socio = await createRegressionMember(org, `${TAG}-ep`, counter, sessionsRemaining);
  await prisma.subscription.update({ where: { id: socio.subscriptionId }, data: { planId: epPlanId } });
  return socio;
}

/** Pasado mañana: fuera de cualquier ventana de cancelación y sin depender de la hora del runner. */
function dayAhead(days = 3) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function epInput(memberId: string | null, date = dayAhead()) {
  return {
    centerId: org.centerId,
    trainerId: org.trainerId,
    title: `EP ${TAG} ${++counter}`,
    type: "personal" as const,
    date,
    startTime: "10:00",
    endTime: "11:00",
    memberId,
    selfBookable: false,
    isTrial: false,
    recurrence: "NONE" as const,
    recUntil: null,
  };
}

const sessionsNamed = (name: string) => prisma.classSession.count({ where: { orgId: org.orgId, name } });

// --- QA-RES-01 · la reserva del campo "Socio" es una reserva de verdad --------

test("QA-RES-01 · asignar socio al crear un EP descuenta su bono y deja asiento", async () => {
  const socio = await epMember(5);
  const input = epInput(socio.id);

  const saved = await saveSession(org.orgId, input);
  assert.equal(saved.ok, true);

  const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: socio.id } });
  assert.equal(booking.status, "BOOKED");
  assert.equal(booking.subscriptionId, socio.subscriptionId, "la reserva recuerda de qué bono salió");
  assert.equal(await balanceOf(socio.subscriptionId), 4, "el EP agendado a mano también gasta sesión");
  const ledger = await prisma.sessionLedger.findMany({ where: { subscriptionId: socio.subscriptionId } });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]!.delta, -1);
});

test("QA-RES-01 · sin saldo, la sesión no se guarda a medias y el error llega", async () => {
  const socio = await epMember(0);
  const input = epInput(socio.id);

  const saved = await saveSession(org.orgId, input);
  assert.equal(saved.ok, false);
  assert.ok(!saved.ok && /no le quedan sesiones/.test(saved.error));
  assert.equal(await sessionsNamed(input.title), 0, "sin reserva no hay franja creada");
  assert.equal(await prisma.booking.count({ where: { memberId: socio.id } }), 0);
});

test("QA-RES-01 · un segundo socio no entra en un EP de una plaza ya ocupada", async () => {
  const [a, b] = [await epMember(5), await epMember(5)];
  const input = epInput(a.id);
  const created = await saveSession(org.orgId, input);
  assert.ok(created.ok);

  const edited = await saveSession(org.orgId, { ...input, id: created.session.id, memberId: b.id });
  assert.equal(edited.ok, false);
  assert.ok(!edited.ok && /completa/.test(edited.error));
  assert.equal(await prisma.booking.count({ where: { sessionId: created.session.id, status: "BOOKED" } }), 1);
  assert.equal(await balanceOf(b.subscriptionId), 5, "a quien no entra no se le cobra");
});

test("QA-RES-01 · el moroso no entra por el campo Socio", async () => {
  const socio = await epMember(5);
  await prisma.member.update({
    where: { id: socio.id },
    data: { state: "DELINQUENT", delinquentSince: new Date(Date.now() - 90 * 86_400_000) },
  });
  const input = epInput(socio.id);

  const saved = await saveSession(org.orgId, input);
  assert.equal(saved.ok, false);
  assert.equal(await sessionsNamed(input.title), 0);
  assert.equal(await balanceOf(socio.subscriptionId), 5);
});

test("QA-RES-01 · createEpSlot (app) cobra igual y no deja franja si falla", async () => {
  const socio = await epMember(3);
  const ok = await createEpSlot(org.orgId, {
    centerId: org.centerId,
    trainerId: org.trainerId,
    date: dayAhead(4),
    startTime: "09:00",
    durationMin: 60,
    selfBookable: false,
    memberId: socio.id,
  });
  assert.equal(ok.ok, true);
  const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: socio.id } });
  assert.equal(booking.subscriptionId, socio.subscriptionId);
  assert.equal(await balanceOf(socio.subscriptionId), 2);

  const broke = await epMember(0);
  const before = await prisma.classSession.count({ where: { orgId: org.orgId } });
  const failed = await createEpSlot(org.orgId, {
    centerId: org.centerId,
    trainerId: org.trainerId,
    date: dayAhead(4),
    startTime: "12:00",
    durationMin: 60,
    selfBookable: false,
    memberId: broke.id,
  });
  assert.equal(failed.ok, false);
  assert.equal(await prisma.classSession.count({ where: { orgId: org.orgId } }), before);
});

// --- QA-RES-08 · el asiento del cobro apunta a su reserva ---------------------

test("QA-RES-08 · la reserva de staff deja el asiento del cobro enlazado a la reserva", async () => {
  const socio = await createRegressionMember(org, `${TAG}-ledger`, ++counter, 5);
  const session = await createRegressionSession(org, `grupo-ledger-${counter}`, { capacity: 4, startsInHours: 72 });

  const booked = await bookSessionForMemberAsStaff(org.orgId, {
    sessionId: session.id,
    memberId: socio.id,
    occurrenceDate: session.day,
  });
  assert.equal(booked.ok, true);

  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: session.id, memberId: socio.id } });
  const entry = await prisma.sessionLedger.findFirstOrThrow({ where: { subscriptionId: socio.subscriptionId } });
  assert.equal(entry.bookingId, booking.id, "sin bookingId el asiento no se puede cuadrar con su reserva");
});

// --- QA-RES-02 · el staff cancela con la misma ventana que el socio ----------

const HOUR = 3_600_000;

test("QA-RES-02 · con antelación se devuelve la sesión; dentro de la ventana, no", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  const early = staffCancellationEffect({
    status: "BOOKED",
    hasSubscription: true,
    startsAt: new Date(now.getTime() + (CANCEL_WINDOW_HOURS + 1) * HOUR),
    now,
    canCancelStarted: false,
  });
  assert.deepEqual(early, { ok: true, refunds: true, forfeited: false });

  const late = staffCancellationEffect({
    status: "BOOKED",
    hasSubscription: true,
    startsAt: new Date(now.getTime() + HOUR),
    now,
    canCancelStarted: false,
  });
  assert.deepEqual(late, { ok: true, refunds: false, forfeited: true });
});

test("QA-RES-02 · una clase ya empezada solo la cancela quien puede ajustar saldo, y sin devolver", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  const past = { status: "BOOKED" as const, hasSubscription: true, startsAt: new Date(now.getTime() - 24 * HOUR), now };

  const trainer = staffCancellationEffect({ ...past, canCancelStarted: false });
  assert.equal(trainer.ok, false);

  const reception = staffCancellationEffect({ ...past, canCancelStarted: true });
  assert.deepEqual(reception, { ok: true, refunds: false, forfeited: true });
});

test("QA-RES-02 · la lista de espera nunca descontó: ni devuelve ni se pierde", () => {
  const now = new Date("2026-09-23T10:00:00Z");
  const effect = staffCancellationEffect({
    status: "WAITLISTED",
    hasSubscription: false,
    startsAt: new Date(now.getTime() + HOUR),
    now,
    canCancelStarted: false,
  });
  assert.deepEqual(effect, { ok: true, refunds: false, forfeited: false });
});

/** Reserva de staff real (con su cobro) en una clase que empieza dentro de `startsInHours`. */
async function bookedGroup(startsInHours: number) {
  const socio = await createRegressionMember(org, `${TAG}-cancel`, ++counter, 5);
  const session = await createRegressionSession(org, `grupo-cancel-${counter}`, { capacity: 4, startsInHours });
  // El mostrador puede apuntar a una clase ya empezada; se reserva con la
  // ocurrencia del día para montar el caso de "cancelar la de ayer".
  const booked = await bookSessionForMemberAsStaff(org.orgId, {
    sessionId: session.id,
    memberId: socio.id,
    occurrenceDate: session.day,
  });
  assert.equal(booked.ok, true);
  assert.equal(await balanceOf(socio.subscriptionId), 4);
  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: session.id, memberId: socio.id } });
  return { socio, booking };
}

test("QA-RES-02 · cancelar a tiempo desde la agenda devuelve el bono", async () => {
  const { socio, booking } = await bookedGroup(CANCEL_WINDOW_HOURS + 48);
  const result = await cancelSessionBooking(org.orgId, booking.id);
  assert.deepEqual(result, { ok: true, forfeited: false });
  assert.equal(await balanceOf(socio.subscriptionId), 5);
});

test("QA-RES-02 · cancelar dentro de la ventana no devuelve el bono", async () => {
  const { socio, booking } = await bookedGroup(1);
  const result = await cancelSessionBooking(org.orgId, booking.id);
  assert.deepEqual(result, { ok: true, forfeited: true });
  assert.equal(await balanceOf(socio.subscriptionId), 4, "la sesión se consume, igual que si cancelara el socio");
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, "CANCELLED");
});

test("QA-RES-02 · la reserva de una clase de ayer: bloqueada sin permiso, y sin devolución con él", async () => {
  const { socio, booking } = await bookedGroup(-24);

  const blocked = await cancelSessionBooking(org.orgId, booking.id);
  assert.equal(blocked.ok, false);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, "BOOKED");

  const allowed = await cancelSessionBooking(org.orgId, booking.id, { canCancelStarted: true });
  assert.deepEqual(allowed, { ok: true, forfeited: true });
  assert.equal(await balanceOf(socio.subscriptionId), 4, "nadie recupera la sesión de una clase ya pasada");
});

// --- QA-RES-05 · borrar una ocurrencia, o desde ella, sin tocar el pasado ----

const DAY = 86_400_000;

/**
 * Serie semanal que empezó hace dos semanas, con tres socios apuntados: uno a
 * la ocurrencia de la semana pasada (sin marcar), otro a la de la semana que
 * viene y otro a la siguiente. Todas las reservas por el camino real, con cobro.
 */
async function weeklyWithBookings(name: string) {
  const series = await createRegressionSession(org, `${name}-${++counter}`, {
    capacity: 4,
    startsInHours: -14 * 24 + 2,
    recurrence: "WEEKLY",
  });
  const at = (weeks: number) => new Date(series.day.getTime() + weeks * 7 * DAY);
  const pastDay = at(1);
  const nextDay = at(3);
  const laterDay = at(4);

  const socios: Record<"past" | "next" | "later", RegressionMember> = {
    past: await createRegressionMember(org, `${TAG}-${name}`, ++counter, 5),
    next: await createRegressionMember(org, `${TAG}-${name}`, ++counter, 5),
    later: await createRegressionMember(org, `${TAG}-${name}`, ++counter, 5),
  };
  for (const [key, day] of [["past", pastDay], ["next", nextDay], ["later", laterDay]] as const) {
    const booked = await bookSessionForMemberAsStaff(org.orgId, {
      sessionId: series.id,
      memberId: socios[key].id,
      occurrenceDate: day,
    });
    assert.equal(booked.ok, true, `reserva de ${key}`);
  }
  return { series, socios, nextDay };
}

const bookingOf = (memberId: string) => prisma.booking.findFirst({ where: { memberId } });

test("QA-RES-05 · borrar 'solo esta' ocurrencia devuelve solo la suya y la serie sigue", async () => {
  const { series, socios, nextDay } = await weeklyWithBookings("borrar-single");

  const result = await deleteSession(org.orgId, series.id, {
    actorUserId: org.trainerId,
    scope: "single",
    occurrenceDate: nextDay,
  });
  assert.deepEqual(result, { ok: true, refunded: 1, notified: 1 });

  assert.equal(await balanceOf(socios.next.subscriptionId), 5, "la ocurrencia borrada devuelve su sesión");
  assert.equal(await bookingOf(socios.next.id), null);
  assert.equal(await balanceOf(socios.past.subscriptionId), 4, "el pasado no se toca");
  assert.ok(await bookingOf(socios.past.id), "la reserva de la semana pasada sigue ahí");
  assert.equal(await balanceOf(socios.later.subscriptionId), 4);
  const later = await bookingOf(socios.later.id);
  assert.ok(later, "la ocurrencia siguiente conserva su reserva");
  assert.ok(await prisma.classSession.findUnique({ where: { id: later.sessionId } }), "…en una fila que existe");
});

test("QA-RES-05 · borrar 'esta y las siguientes' recorta la serie y no devuelve el pasado", async () => {
  const { series, socios, nextDay } = await weeklyWithBookings("borrar-future");

  const result = await deleteSession(org.orgId, series.id, {
    actorUserId: org.trainerId,
    scope: "future",
    occurrenceDate: nextDay,
  });
  assert.deepEqual(result, { ok: true, refunded: 2, notified: 2 });

  assert.equal(await balanceOf(socios.next.subscriptionId), 5);
  assert.equal(await balanceOf(socios.later.subscriptionId), 5);
  assert.equal(await balanceOf(socios.past.subscriptionId), 4);
  assert.ok(await bookingOf(socios.past.id));
  const row = await prisma.classSession.findUniqueOrThrow({ where: { id: series.id } });
  assert.ok(row.recUntil && row.recUntil < nextDay, "la serie termina la víspera del día borrado");
});

test("QA-RES-05 · borrar toda la serie devuelve solo las ocurrencias futuras", async () => {
  const { series, socios } = await weeklyWithBookings("borrar-all");

  const result = await deleteSession(org.orgId, series.id, { actorUserId: org.trainerId, scope: "all" });
  assert.deepEqual(result, { ok: true, refunded: 2, notified: 2 });
  assert.equal(await balanceOf(socios.past.subscriptionId), 4, "la clase de la semana pasada no se reembolsa");
  assert.equal(await balanceOf(socios.next.subscriptionId), 5);
  assert.equal(await balanceOf(socios.later.subscriptionId), 5);
  assert.equal(await prisma.classSession.findUnique({ where: { id: series.id } }), null);
});

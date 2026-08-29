import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { bookSessionForMemberAsStaff, cancelSessionBooking } from "@/lib/agenda-queries";
import { bookSessionForMember } from "@/lib/portal-queries";
import { notifySessionVacancy } from "@/lib/session-vacancy-notify";
import { pickBookingSubscription, shouldNotifyVacancy } from "@/lib/session-booking";
import { isOperatingDay } from "@/app/(app)/agenda/agenda-utils";

/**
 * Reserva y cancelación de plazas de grupo reducido HECHAS POR EL STAFF desde
 * la agenda, y el aviso automático a la lista de espera.
 *
 * Lo que se protege aquí es dinero y plazas, las dos cosas que el socio nota:
 *
 * 1. Que reservar desde el mostrador trate el bono igual que si reservara el
 *    propio socio desde la app —descontar al reservar, devolver al cancelar—.
 *    Sin esto, apuntar a alguien por teléfono le regalaba sesiones o se las
 *    comía, y el descuadre solo aparece semanas después, al agotarse el bono.
 * 2. Que al liberarse una plaza en una sesión con lista de espera se avise a
 *    TODA la lista y se la quede quien la reclame primero, sin que dos
 *    personas avisadas del mismo hueco acaben las dos dentro (la sesión
 *    sobrevendida es un cliente que se va a casa desde la puerta).
 *
 * Los tests montan su propia organización contra la base real y la borran al
 * terminar: la condición de carrera del punto 2 solo se manifiesta en lo que
 * queda escrito, y con un doble de la base de datos no se prueba nada.
 */

const SUFFIX = "e2e-agenda-booking-test";

type Fixture = {
  orgId: string;
  centerId: string;
  sessionId: string;
  day: Date;
  members: { id: string; subscriptionId: string }[];
};

/** Primer día operativo a partir de mañana: el centro no abre todos los días. */
function nextBookableDay(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  while (!isOperatingDay(day)) day.setDate(day.getDate() + 1);
  return day;
}

/**
 * Organización mínima: un centro, un bono de grupos y una clase de grupo
 * reducido con el aforo pedido. Cada socio nace con su propia credencial —el
 * aviso de plaza sale por email, así que sin `User` no habría a quién avisar—.
 */
async function createFixture(
  tag: string,
  opts: { capacity: number; balances: (number | null)[] }
): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Agenda ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Bono grupos ${tag}`, type: "SESSION_PACK", sessionsIncluded: 10, priceCents: 6000 },
  });

  const members: Fixture["members"] = [];
  for (const [i, balance] of opts.balances.entries()) {
    const email = `${slug}-socio${i}@example.com`;
    const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
    const user = await prisma.user.create({
      data: { identityId: identity.id, orgId: org.id, centerId: center.id, name: `Socio ${i}`, email, role: "MEMBER" },
    });
    const member = await prisma.member.create({
      data: {
        orgId: org.id,
        primaryCenterId: center.id,
        userId: user.id,
        firstName: `Socio${i}`,
        lastName: tag,
        email,
        state: "ACTIVE",
      },
    });
    const subscription = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        centerId: center.id,
        startDate: new Date(),
        priceCents: 6000,
        sessionsIncluded: 10,
        sessionsRemaining: balance,
      },
    });
    members.push({ id: member.id, subscriptionId: subscription.id });
  }

  const day = nextBookableDay();
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: `Grupo reducido ${tag}`,
      classType: "Grupo reducido",
      date: day,
      startTime: "18:00",
      endTime: "19:00",
      capacity: opts.capacity,
    },
  });

  return { orgId: org.id, centerId: center.id, sessionId: session.id, day, members };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.booking.deleteMany({ where: { session: { orgId: org.id } } });
    await prisma.classSession.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { id: true, identityId: true } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.user.deleteMany({ where: { orgId: org.id } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

/**
 * El aviso de plaza es fire-and-forget y, sin Brevo configurado, el mailer
 * vuelca cada email entero al log. Aquí solo interesa a quién se avisa, así que
 * se silencia ese volcado (y solo ese) para que la salida del test se lea.
 */
const realLog = console.log;
function silenceMailerLog() {
  console.log = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && (first.startsWith("[mailer]") || first.startsWith("<!DOCTYPE"))) return;
    realLog(...args);
  };
}

const balanceOf = (subscriptionId: string) =>
  prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, select: { sessionsRemaining: true } });

before(async () => {
  silenceMailerLog();
  await cleanup();
});
after(async () => {
  // Los avisos de plaza salen sin esperar respuesta: se les da un respiro para
  // que terminen sus consultas antes de borrarles las filas debajo.
  await new Promise((resolve) => setTimeout(resolve, 250));
  await cleanup();
  console.log = realLog;
  await prisma.$disconnect();
});

// --- Reserva y cancelación por staff -----------------------------------------

test("reservar desde la agenda descuenta el bono del socio y lo devuelve al cancelar", async () => {
  const f = await createFixture("bono", { capacity: 6, balances: [5] });
  const [socio] = f.members;

  const booked = await bookSessionForMemberAsStaff(f.orgId, {
    sessionId: f.sessionId,
    memberId: socio.id,
    occurrenceDate: f.day,
  });
  assert.deepEqual(booked, { ok: true, claimedFromWaitlist: false });

  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: f.sessionId, memberId: socio.id } });
  assert.equal(booking.status, "BOOKED");
  assert.equal(
    booking.subscriptionId,
    socio.subscriptionId,
    "la reserva tiene que recordar de qué bono salió, o al cancelar no hay a dónde devolverla"
  );
  assert.equal((await balanceOf(socio.subscriptionId)).sessionsRemaining, 4);

  const cancelled = await cancelSessionBooking(f.orgId, booking.id);
  assert.deepEqual(cancelled, { ok: true });
  assert.equal((await balanceOf(socio.subscriptionId)).sessionsRemaining, 5, "cancelar devuelve la sesión al bono");
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  assert.equal(after.status, "CANCELLED");
  assert.equal(after.subscriptionId, null);
});

test("un bono ilimitado reserva sin descontar nada", async () => {
  const f = await createFixture("ilimitado", { capacity: 6, balances: [null] });
  const [socio] = f.members;

  const booked = await bookSessionForMemberAsStaff(f.orgId, {
    sessionId: f.sessionId,
    memberId: socio.id,
    occurrenceDate: f.day,
  });
  assert.equal(booked.ok, true);

  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: f.sessionId, memberId: socio.id } });
  assert.equal(booking.subscriptionId, null, "la cuota ilimitada no consume saldo: no hay bono al que cargar la plaza");
  assert.equal((await balanceOf(socio.subscriptionId)).sessionsRemaining, null);
});

test("sin saldo no se reserva, y el bono no se queda en negativo", async () => {
  const f = await createFixture("sin-saldo", { capacity: 6, balances: [0] });
  const [socio] = f.members;

  const booked = await bookSessionForMemberAsStaff(f.orgId, {
    sessionId: f.sessionId,
    memberId: socio.id,
    occurrenceDate: f.day,
  });
  assert.equal(booked.ok, false);
  assert.equal(await prisma.booking.count({ where: { sessionId: f.sessionId } }), 0);
  assert.equal((await balanceOf(socio.subscriptionId)).sessionsRemaining, 0);
});

test("desde el mostrador no se sobrevende ni se duplica la plaza de un socio", async () => {
  const f = await createFixture("aforo", { capacity: 1, balances: [3, 3] });
  const [primero, segundo] = f.members;

  const one = await bookSessionForMemberAsStaff(f.orgId, {
    sessionId: f.sessionId,
    memberId: primero.id,
    occurrenceDate: f.day,
  });
  assert.equal(one.ok, true);

  // La clase se ha quedado sin plazas: el staff no apunta a nadie a la lista de
  // espera (eso lo hace el cliente desde la app), así que se rechaza sin cobrar.
  const full = await bookSessionForMemberAsStaff(f.orgId, {
    sessionId: f.sessionId,
    memberId: segundo.id,
    occurrenceDate: f.day,
  });
  assert.equal(full.ok, false);
  assert.equal((await balanceOf(segundo.subscriptionId)).sessionsRemaining, 3, "una reserva rechazada no cobra");

  // Y quien ya está dentro no ocupa dos plazas por pulsar dos veces.
  const twice = await bookSessionForMemberAsStaff(f.orgId, {
    sessionId: f.sessionId,
    memberId: primero.id,
    occurrenceDate: f.day,
  });
  assert.equal(twice.ok, false);
  assert.equal((await balanceOf(primero.subscriptionId)).sessionsRemaining, 2);
  assert.equal(await prisma.booking.count({ where: { sessionId: f.sessionId, status: "BOOKED" } }), 1);
});

test("una reserva de staff es puntual: solo ocupa el día que se pidió", async () => {
  // El "cliente fijo" de grupos reducidos NO existe (se queda en EP): apuntar a
  // alguien al martes no lo apunta a los martes siguientes.
  const f = await createFixture("puntual", { capacity: 6, balances: [5] });
  const [socio] = f.members;
  await prisma.classSession.update({ where: { id: f.sessionId }, data: { recurrence: "WEEKLY" } });

  await bookSessionForMemberAsStaff(f.orgId, { sessionId: f.sessionId, memberId: socio.id, occurrenceDate: f.day });

  const bookings = await prisma.booking.findMany({ where: { sessionId: f.sessionId } });
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].occurrenceDate.getTime(), f.day.getTime());
  assert.equal((await balanceOf(socio.subscriptionId)).sessionsRemaining, 4, "se cobra una sesión, no la serie entera");
});

// --- Aviso a la lista de espera y reclamo de la plaza -------------------------

test("al liberarse una plaza se avisa a toda la lista de espera, y solo a ella", async () => {
  const f = await createFixture("aviso", { capacity: 1, balances: [3, 3, 3, 3] });
  const [dentro, esperaA, esperaB, ajeno] = f.members;

  await prisma.booking.create({
    data: {
      sessionId: f.sessionId,
      occurrenceDate: f.day,
      memberId: dentro.id,
      status: "BOOKED",
      subscriptionId: dentro.subscriptionId,
    },
  });
  for (const [i, esperando] of [esperaA, esperaB].entries()) {
    await prisma.booking.create({
      data: {
        sessionId: f.sessionId,
        occurrenceDate: f.day,
        memberId: esperando.id,
        status: "WAITLISTED",
        waitlistPosition: i + 1,
      },
    });
  }

  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: f.sessionId, memberId: dentro.id } });
  await cancelSessionBooking(f.orgId, booking.id);

  const notice = await notifySessionVacancy({ orgId: f.orgId, sessionId: f.sessionId, occurrenceDate: f.day });
  assert.equal(notice.toWaitlist, true);
  assert.deepEqual(
    [...notice.notifiedMemberIds].sort(),
    [esperaA.id, esperaB.id].sort(),
    "se avisa a todos los que esperan, a la vez"
  );
  assert.ok(
    !notice.notifiedMemberIds.includes(ajeno.id),
    "con lista de espera el aviso no se abre al resto del centro: les quitaría la plaza que llevaban esperando"
  );
});

test("sin lista de espera, el hueco se ofrece a los socios con bono de esa modalidad en el centro", async () => {
  const f = await createFixture("aviso-abierto", { capacity: 1, balances: [3, 3] });
  const [dentro, otro] = f.members;

  await prisma.booking.create({
    data: {
      sessionId: f.sessionId,
      occurrenceDate: f.day,
      memberId: dentro.id,
      status: "BOOKED",
      subscriptionId: dentro.subscriptionId,
    },
  });
  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: f.sessionId, memberId: dentro.id } });
  await cancelSessionBooking(f.orgId, booking.id);

  const notice = await notifySessionVacancy({
    orgId: f.orgId,
    sessionId: f.sessionId,
    occurrenceDate: f.day,
    excludeMemberId: dentro.id,
  });
  assert.equal(notice.toWaitlist, false);
  assert.deepEqual(notice.notifiedMemberIds, [otro.id]);
});

test("la plaza liberada es del primero que la reclama: el segundo sigue en la lista", async () => {
  const f = await createFixture("reclamo", { capacity: 1, balances: [3, 3, 3] });
  const [dentro, esperaA, esperaB] = f.members;

  await prisma.booking.create({
    data: {
      sessionId: f.sessionId,
      occurrenceDate: f.day,
      memberId: dentro.id,
      status: "BOOKED",
      subscriptionId: dentro.subscriptionId,
    },
  });
  for (const [i, esperando] of [esperaA, esperaB].entries()) {
    await prisma.booking.create({
      data: {
        sessionId: f.sessionId,
        occurrenceDate: f.day,
        memberId: esperando.id,
        status: "WAITLISTED",
        waitlistPosition: i + 1,
      },
    });
  }
  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: f.sessionId, memberId: dentro.id } });
  await cancelSessionBooking(f.orgId, booking.id);

  // El segundo de la lista se adelanta desde el portal: no hay orden de cola
  // garantizado, la plaza es de quien reserva antes (RB-RES-007).
  const claimed = await bookSessionForMember(await memberForBooking(esperaB.id), f.sessionId, dateParam(f.day));
  assert.deepEqual(claimed, { ok: true, waitlisted: false });
  assert.equal((await balanceOf(esperaB.subscriptionId)).sessionsRemaining, 2, "reclamar la plaza sí descuenta bono");

  // Y quien llega tarde no entra: la clase vuelve a estar llena.
  const late = await bookSessionForMember(await memberForBooking(esperaA.id), f.sessionId, dateParam(f.day));
  assert.equal(late.ok, false);
  assert.equal(
    (await balanceOf(esperaA.subscriptionId)).sessionsRemaining,
    3,
    "a quien se queda esperando no se le cobra nada"
  );
  const stillWaiting = await prisma.booking.findFirstOrThrow({
    where: { sessionId: f.sessionId, memberId: esperaA.id },
  });
  assert.equal(stillWaiting.status, "WAITLISTED", "sigue en la lista, no se le cancela por llegar tarde");
  assert.equal(
    await prisma.booking.count({ where: { sessionId: f.sessionId, occurrenceDate: f.day, status: "BOOKED" } }),
    1
  );
});

test("dos avisados que reclaman a la vez no entran los dos", async () => {
  const f = await createFixture("carrera", { capacity: 1, balances: [3, 3, 3] });
  const [dentro, esperaA, esperaB] = f.members;

  await prisma.booking.create({
    data: {
      sessionId: f.sessionId,
      occurrenceDate: f.day,
      memberId: dentro.id,
      status: "BOOKED",
      subscriptionId: dentro.subscriptionId,
    },
  });
  for (const [i, esperando] of [esperaA, esperaB].entries()) {
    await prisma.booking.create({
      data: {
        sessionId: f.sessionId,
        occurrenceDate: f.day,
        memberId: esperando.id,
        status: "WAITLISTED",
        waitlistPosition: i + 1,
      },
    });
  }
  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: f.sessionId, memberId: dentro.id } });
  await cancelSessionBooking(f.orgId, booking.id);

  // El aviso sale para toda la lista a la vez, así que este es el caso real:
  // dos personas pulsando "Reservar" con el mismo email delante. Uno por el
  // portal y otro por el mostrador, que es el camino nuevo.
  const [porPortal, porMostrador] = await Promise.all([
    bookSessionForMember(await memberForBooking(esperaA.id), f.sessionId, dateParam(f.day)),
    bookSessionForMemberAsStaff(f.orgId, { sessionId: f.sessionId, memberId: esperaB.id, occurrenceDate: f.day }),
  ]);

  const winners = [porPortal, porMostrador].filter((r) => r.ok);
  assert.equal(winners.length, 1, "la plaza es de uno de los dos, nunca de los dos");
  assert.equal(
    await prisma.booking.count({ where: { sessionId: f.sessionId, occurrenceDate: f.day, status: "BOOKED" } }),
    1,
    "el aforo de 1 sigue siendo 1: sobrevender la clase es dejar a alguien en la puerta"
  );
  const balances = await prisma.subscription.findMany({
    where: { id: { in: [esperaA.subscriptionId, esperaB.subscriptionId] } },
    select: { sessionsRemaining: true },
  });
  assert.deepEqual(
    balances.map((b) => b.sessionsRemaining).sort(),
    [2, 3],
    "solo se le cobra a quien se quedó la plaza"
  );
});

// --- Reglas puras --------------------------------------------------------------

test("shouldNotifyVacancy: salir de la lista de espera no libera ninguna plaza", () => {
  assert.equal(shouldNotifyVacancy({ cancelledStatus: "WAITLISTED", wasFull: true, hasWaitlist: true }), false);
  assert.equal(shouldNotifyVacancy({ cancelledStatus: "BOOKED", wasFull: true, hasWaitlist: false }), true);
  // Aforo ampliado después de formarse la lista: ya no estaba llena, pero
  // sigue habiendo gente esperando ese hueco.
  assert.equal(shouldNotifyVacancy({ cancelledStatus: "BOOKED", wasFull: false, hasWaitlist: true }), true);
  assert.equal(shouldNotifyVacancy({ cancelledStatus: "BOOKED", wasFull: false, hasWaitlist: false }), false);
});

test("pickBookingSubscription: gasta antes el bono que menos vida le queda", () => {
  const sub = (id: string, sessionsRemaining: number | null, centerId = "c1", type = "SESSION_PACK") => ({
    id,
    centerId,
    sessionsRemaining,
    plan: { type },
  });

  assert.deepEqual(
    pickBookingSubscription([sub("a", 5), sub("b", 2)], { centerId: "c1", kind: "GROUP", consumesSession: true }),
    { ok: true, subscriptionId: "b" }
  );
  // La cuota ilimitada no descuenta: manda sobre los bonos con saldo.
  assert.deepEqual(
    pickBookingSubscription([sub("a", 2), sub("b", null)], { centerId: "c1", kind: "GROUP", consumesSession: true }),
    { ok: true, subscriptionId: null }
  );
  // RB-AGENDA-003: el bono de otro centro (o de otra modalidad) no cubre esta sesión.
  assert.deepEqual(
    pickBookingSubscription([sub("a", 5, "c2")], { centerId: "c1", kind: "GROUP", consumesSession: true }),
    { ok: false, reason: "NO_PLAN" }
  );
  assert.deepEqual(
    pickBookingSubscription([sub("a", 5, "c1", "PERSONAL_TRAINING")], {
      centerId: "c1",
      kind: "GROUP",
      consumesSession: true,
    }),
    { ok: false, reason: "NO_PLAN" }
  );
  assert.deepEqual(
    pickBookingSubscription([sub("a", 0)], { centerId: "c1", kind: "GROUP", consumesSession: true }),
    { ok: false, reason: "NO_BALANCE" }
  );
  // Entrar en lista de espera exige bono de la modalidad, pero no gasta saldo.
  assert.deepEqual(
    pickBookingSubscription([sub("a", 0)], { centerId: "c1", kind: "GROUP", consumesSession: false }),
    { ok: true, subscriptionId: null }
  );
});

/** El socio tal y como lo carga el portal antes de reservar (`getMemberForUser`). */
async function memberForBooking(memberId: string) {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { subscriptions: { where: { status: "ACTIVE" }, include: { plan: true } } },
  });
  return {
    id: member.id,
    primaryCenterId: member.primaryCenterId,
    subscriptions: member.subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      centerId: s.centerId,
      sessionsRemaining: s.sessionsRemaining,
      plan: { type: s.plan.type },
    })),
  };
}

/** "YYYY-MM-DD" del día local, que es como viaja la ocurrencia por la URL. */
function dateParam(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

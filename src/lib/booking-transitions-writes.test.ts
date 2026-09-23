import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BOOKING_WRITE_POINTS, bookingTransitionMessage, type BookingWritePointId } from "@/lib/booking-transitions";
import { setSessionDebrief, clearSessionDebrief } from "@/lib/session-debrief";
import { markBookingNoShow, clearBookingNoShow, cancelSessionBooking, discardAttendeeAsStaff } from "@/lib/agenda-queries";
import { bookSessionForMember, cancelBookingForMember } from "@/lib/portal-queries";
import { trainerDiscardEffect } from "@/lib/attendee-discard";
import { isOperatingDay } from "@/app/(app)/agenda/agenda-utils";
import {
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  type RegressionMember,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * E2-02 / RB-RES-010, QA-RES-09 · Los puntos de escritura del estado de una
 * reserva, ejercidos DE VERDAD.
 *
 * La versión anterior de este fichero decía probar "las cuatro vías" y solo
 * consultaba la tabla de transiciones: la tabla nunca fue lo que fallaba, lo
 * que fallaba es que nadie la consultaba. Aquí se llama a cada función que
 * escribe, sobre filas reales, y se mira la fila después.
 *
 * La lista de puntos NO vive aquí: es `BOOKING_WRITE_POINTS`, en
 * booking-transitions.ts. El primer test exige que cada punto de esa lista
 * tenga su ejercicio en este fichero, así que añadir un punto de escritura sin
 * probarlo falla aquí y no en producción.
 */

const TAG = "qa-res-09";
let org: RegressionOrg;
let sessionId: string;
let day: Date;
let seq = 0;

function nextBookableDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 2);
  while (!isOperatingDay(d)) d.setDate(d.getDate() + 1);
  return d;
}

const dateParam = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
  // Sesión futura (fuera de la ventana de cancelación): así la cancelación
  // del portal y el descarte llegan hasta el UPDATE y no se paran antes por
  // "ya ha empezado".
  day = nextBookableDay();
  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name: "clase-escrituras",
      classType: "Grupo reducido",
      date: day,
      startTime: "18:00",
      endTime: "19:00",
      capacity: 50,
    },
  });
  sessionId = session.id;
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

async function bookingWith(status: BookingStatus): Promise<{ socio: RegressionMember; bookingId: string }> {
  const socio = await createRegressionMember(org, TAG, ++seq, 5);
  const booking = await prisma.booking.create({
    data: {
      sessionId,
      occurrenceDate: day,
      memberId: socio.id,
      status,
      subscriptionId: status === "BOOKED" || status === "ATTENDED" || status === "NO_SHOW" ? socio.subscriptionId : null,
      waitlistPosition: status === "WAITLISTED" ? 1 : null,
    },
  });
  return { socio, bookingId: booking.id };
}

const statusOf = async (bookingId: string) =>
  (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { status: true } })).status;

const actor = () => ({
  sessionId,
  orgId: org.orgId,
  actorUserId: org.trainerId,
  actorRole: "TRAINER" as const,
  actorCenterId: org.centerId,
});

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

/** Un ejercicio por punto de escritura. La clave es el id de `BOOKING_WRITE_POINTS`. */
const EXERCISES: Record<BookingWritePointId, () => Promise<void>> = {
  "agenda-check-in": async () => {
    // `toggleCheckIn` es un Server Action con `requireRole`: necesita sesión de
    // navegador y aquí no se puede llamar. Se fija que sigue entrando por la
    // máquina de estados (y por `clearBookingNoShow` al rectificar una falta);
    // el recorrido completo lo cubre el spec no-show-motivo.
    const source = readFileSync("src/app/(app)/agenda/session/[id]/actions.ts", "utf8");
    const body = source.slice(source.indexOf("export async function toggleCheckIn"));
    assert.match(body, /checkBookingTransition\(booking\.status, newStatus\)/);
    assert.match(body, /statusesEndingAt\(newStatus\)/);
    assert.match(body, /clearBookingNoShow\(/);
  },

  debrief: async () => {
    for (const from of ["CANCELLED", "WAITLISTED"] as const) {
      const { bookingId } = await bookingWith(from);
      const set = await setSessionDebrief({ ...actor(), bookingId, feeling: "GREEN" });
      assert.equal(set.ok === false && set.status, 409, `debrief sobre ${from}`);
      assert.equal(await statusOf(bookingId), from);
      assert.equal(await prisma.sessionDebrief.count({ where: { bookingId } }), 0);
    }
    const { bookingId: cancelada } = await bookingWith("CANCELLED");
    const cleared = await clearSessionDebrief({ ...actor(), bookingId: cancelada });
    assert.equal(cleared.ok === false && cleared.status, 409, "desmarcar nunca resucita una cancelada");
    assert.equal(await statusOf(cancelada), "CANCELLED");

    const { bookingId: viva } = await bookingWith("BOOKED");
    assert.equal((await setSessionDebrief({ ...actor(), bookingId: viva, feeling: "GREEN" })).ok, true);
    assert.equal(await statusOf(viva), "ATTENDED");
  },

  "no-show": async () => {
    const { bookingId: cancelada } = await bookingWith("CANCELLED");
    const marked = await markBookingNoShow(org.orgId, cancelada, { reason: "FORGOT", refundSession: false });
    assert.equal(marked.ok, false);
    const cleared = await clearBookingNoShow(org.orgId, cancelada, "ATTENDED");
    assert.equal(cleared.ok, false);
    assert.equal(await statusOf(cancelada), "CANCELLED");

    const { bookingId: enEspera } = await bookingWith("WAITLISTED");
    assert.equal((await markBookingNoShow(org.orgId, enEspera, { reason: "FORGOT", refundSession: false })).ok, false);
    assert.equal(await statusOf(enEspera), "WAITLISTED");
  },

  "portal-cancel": async () => {
    // Una asistida no se cancela: borraría el histórico de asistencia. Y el
    // mensaje es el de la máquina de estados, el mismo en todas las vías.
    const { socio, bookingId: asistida } = await bookingWith("ATTENDED");
    const result = await cancelBookingForMember(socio.id, asistida);
    assert.deepEqual(result, { ok: false, error: bookingTransitionMessage("ATTENDED", "CANCELLED") });
    assert.equal(await statusOf(asistida), "ATTENDED");

    const { socio: s2, bookingId: falta } = await bookingWith("NO_SHOW");
    assert.equal((await cancelBookingForMember(s2.id, falta)).ok, false);
    assert.equal(await statusOf(falta), "NO_SHOW");

    const { socio: s3, bookingId: cancelada } = await bookingWith("CANCELLED");
    assert.equal((await cancelBookingForMember(s3.id, cancelada)).ok, false);

    const { socio: s4, bookingId: viva } = await bookingWith("BOOKED");
    assert.equal((await cancelBookingForMember(s4.id, viva)).ok, true);
    assert.equal(await statusOf(viva), "CANCELLED");
  },

  "portal-claim": async () => {
    // Reclamar la plaza es WAITLISTED → BOOKED, la única salida legítima de la
    // cola. Una reserva cancelada del mismo socio no se resucita: se crea otra.
    const { socio, bookingId: enEspera } = await bookingWith("WAITLISTED");
    const claimed = await bookSessionForMember(await memberForBooking(socio.id), sessionId, dateParam(day));
    assert.deepEqual(claimed, { ok: true, waitlisted: false });
    assert.equal(await statusOf(enEspera), "BOOKED");

    const { socio: s2, bookingId: cancelada } = await bookingWith("CANCELLED");
    const again = await bookSessionForMember(await memberForBooking(s2.id), sessionId, dateParam(day));
    assert.equal(again.ok, true);
    assert.equal(await statusOf(cancelada), "CANCELLED", "CANCELLED es terminal");
  },

  "staff-cancel": async () => {
    for (const from of ["ATTENDED", "NO_SHOW", "CANCELLED"] as const) {
      const { bookingId } = await bookingWith(from);
      const result = await cancelSessionBooking(org.orgId, bookingId);
      assert.equal(result.ok, false, `cancelar desde la agenda una reserva ${from}`);
      assert.equal(await statusOf(bookingId), from);
    }
  },

  discard: async () => {
    for (const from of ["ATTENDED", "NO_SHOW", "CANCELLED"] as const) {
      const { bookingId } = await bookingWith(from);
      const result = await discardAttendeeAsStaff(org.orgId, bookingId, {
        actorUserId: org.trainerId,
        notifyMember: false,
      });
      assert.equal(result.ok, false, `descartar una reserva ${from}`);
      assert.equal(await statusOf(bookingId), from);

      // Y la decisión pura dice lo mismo: no hay efecto sobre el bono de un
      // descarte que la máquina de estados no admite.
      const effect = trainerDiscardEffect({
        startsAt: new Date(Date.now() + 72 * 3_600_000),
        now: new Date(),
        status: from,
        hasSubscription: true,
      });
      assert.equal(effect.transition.ok, false, `trainerDiscardEffect sobre ${from}`);
      assert.equal(effect.refunds, false);
    }

    const { bookingId: viva } = await bookingWith("BOOKED");
    const done = await discardAttendeeAsStaff(org.orgId, viva, { actorUserId: org.trainerId, notifyMember: false });
    assert.equal(done.ok, true);
    assert.equal(await statusOf(viva), "CANCELLED");
  },
};

test("QA-RES-09 · cada punto de escritura de BOOKING_WRITE_POINTS tiene su ejercicio aquí", () => {
  const listed = BOOKING_WRITE_POINTS.map((p) => p.id).sort();
  assert.deepEqual(listed, Object.keys(EXERCISES).sort());
  assert.equal(new Set(listed).size, listed.length, "sin ids repetidos");
});

for (const point of BOOKING_WRITE_POINTS) {
  test(`QA-RES-09 · ${point.id} (${point.writer}) respeta la máquina de estados`, async () => {
    await EXERCISES[point.id]();
  });
}

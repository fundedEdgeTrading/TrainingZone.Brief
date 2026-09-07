import test from "node:test";
import assert from "node:assert/strict";
import type { UpcomingBooking } from "@/lib/portal-queries";
import { pickNextLiveBooking } from "./next-session";

/**
 * E5-04 — escenario principal: "la próxima reserva aparece con fecha, hora,
 * sala y acción de cancelar". La lista que entrega `getMemberUpcomingBookings`
 * ya viene ordenada por `startsAt` ascendente; lo que valida este test es que
 * una clase anulada por el centro no se cuela como "tu próxima sesión".
 */

function booking(overrides: Partial<UpcomingBooking>): UpcomingBooking {
  return {
    bookingId: "b1",
    status: "BOOKED",
    waitlistPosition: null,
    sessionId: "s1",
    occurrenceDate: "2026-09-10",
    sessionName: "Grupo reducido",
    classType: "Grupo",
    startsAt: new Date("2026-09-10T18:00:00Z"),
    dayLabel: "Jueves, 10 de septiembre",
    startTime: "18:00",
    endTime: "19:00",
    centerName: "Centro",
    room: "Sala 1",
    trainerName: "Ana",
    trainerImage: null,
    sessionCancelled: false,
    canCancelFreely: true,
    cancelWindowHours: 24,
    full: false,
    ...overrides,
  };
}

test("sin reservas, no hay próxima sesión", () => {
  assert.equal(pickNextLiveBooking([]), null);
});

test("toma la primera reserva de la lista (ya viene ordenada por fecha)", () => {
  const first = booking({ bookingId: "b1" });
  const second = booking({ bookingId: "b2" });
  assert.equal(pickNextLiveBooking([first, second])?.bookingId, "b1");
});

test("una clase anulada por el centro no cuenta como próxima sesión", () => {
  const cancelled = booking({ bookingId: "b-cancelada", sessionCancelled: true });
  const live = booking({ bookingId: "b-viva", sessionCancelled: false });
  assert.equal(pickNextLiveBooking([cancelled, live])?.bookingId, "b-viva");
});

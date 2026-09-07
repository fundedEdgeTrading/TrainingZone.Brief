import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { CANCEL_WINDOW_HOURS } from "@/lib/portal-queries";
import { mobileLogin, bearer, jsonOf, API_PREFIX } from "./fixtures/mobile-api";
import {
  balanceOf,
  cleanupFixtures,
  createFixtureMember,
  createFixtureSession,
  dateParam,
  fixtureContext,
  FIXTURE_PASSWORD,
  type FixtureContext,
  type FixtureMember,
} from "./fixtures/mobile-members";

/**
 * E7-06 · E7 — cancelación tardía: el aviso lleva el número real y el bono baja.
 *
 * Las dos mitades van juntas a propósito. Un aviso con las horas correctas
 * sobre una regla que devuelve el bono igualmente es un aviso mentiroso; y una
 * penalización correcta sin aviso es una sesión que el socio pierde sin saber
 * por qué. Lo que se prueba aquí es que la API dice y hace lo mismo:
 *
 *  - `cancelWindowHours` viaja EN LA RESPUESTA, para que el cliente no tenga
 *    que escribir "24 h" en ninguna pantalla (invariante del trimestre: cero
 *    literales de horas en el cliente, ni en la web ni en la app).
 *  - `canCancelFreely` distingue las dos reservas del socio, la de dentro de la
 *    ventana y la de fuera.
 *  - Al cancelar tarde, la respuesta declara `forfeited: true` y el saldo NO
 *    vuelve; al cancelar a tiempo, vuelve.
 *  - La lista de espera nunca descontó, así que nunca se reembolsa —y tampoco
 *    se la penaliza—.
 */

const TAG = "cancelacion";

let ctx: FixtureContext;
let socio: FixtureMember;
let tardio: { sessionId: string; day: Date };
let holgado: { sessionId: string; day: Date };

type UpcomingBooking = {
  bookingId: string;
  sessionId: string;
  status: string;
  canCancelFreely: boolean;
  cancelWindowHours: number;
};
type AgendaDto = { upcomingBookings: UpcomingBooking[]; sessions: { id: string; cancelWindowHours?: number }[] };

test.beforeAll(async ({ request }) => {
  await cleanupFixtures();
  ctx = await fixtureContext(TAG);
  socio = await createFixtureMember(ctx, TAG, 1, 5);

  // Una dentro de la ventana (queda menos antelación de la exigida) y otra
  // fuera. Se calculan DESDE la ventana configurada, no con un 2 y un 72 a
  // pelo: si mañana se cambia la configuración, el test sigue probando la regla.
  tardio = await createFixtureSession(ctx, `${TAG}-tarde`, {
    capacity: 6,
    startsInHours: Math.max(1, CANCEL_WINDOW_HOURS - 2),
  });
  holgado = await createFixtureSession(ctx, `${TAG}-holgado`, {
    capacity: 6,
    startsInHours: CANCEL_WINDOW_HOURS + 48,
  });

  const session = await mobileLogin(request, socio.email, FIXTURE_PASSWORD);
  for (const s of [tardio, holgado]) {
    const res = await request.post(`${API_PREFIX}/portal/agenda/book`, {
      headers: bearer(session),
      data: { sessionId: s.sessionId, occurrenceDate: dateParam(s.day) },
    });
    expect(res.status()).toBe(200);
  }
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

async function agenda(request: import("@playwright/test").APIRequestContext) {
  const session = await mobileLogin(request, socio.email, FIXTURE_PASSWORD);
  const body = await jsonOf<AgendaDto>(await request.get(`${API_PREFIX}/portal/agenda`, { headers: bearer(session) }));
  if (!body.ok) throw new Error(`La agenda del socio respondió ok:false — ${body.error}`);
  return { session, data: body.data };
}

test.describe("E7-06 · E7 — cancelar tarde: aviso con el número real y bono que baja", () => {
  test("la agenda del socio trae la ventana del servidor, no un literal del cliente", async ({ request }) => {
    const { data } = await agenda(request);
    const bookings = data.upcomingBookings.filter((b) =>
      [tardio.sessionId, holgado.sessionId].includes(b.sessionId)
    );
    expect(bookings.length).toBe(2);

    for (const booking of bookings) {
      expect(
        booking.cancelWindowHours,
        "sin este número la app tendría que escribir las horas a mano en la pantalla"
      ).toBe(CANCEL_WINDOW_HOURS);
    }
  });

  test("y distingue la reserva que ya está dentro de la ventana", async ({ request }) => {
    const { data } = await agenda(request);
    const tarde = data.upcomingBookings.find((b) => b.sessionId === tardio.sessionId);
    const holgada = data.upcomingBookings.find((b) => b.sessionId === holgado.sessionId);

    expect(tarde?.canCancelFreely, "a menos de la ventana, cancelar ya cuesta la sesión").toBe(false);
    expect(holgada?.canCancelFreely).toBe(true);
  });

  test("cancelar tarde declara forfeited y el bono NO vuelve", async ({ request }) => {
    const { session, data } = await agenda(request);
    const tarde = data.upcomingBookings.find((b) => b.sessionId === tardio.sessionId)!;
    const before = await balanceOf(socio.subscriptionId);

    const res = await request.post(`${API_PREFIX}/portal/agenda/${tarde.bookingId}/cancel`, {
      headers: bearer(session),
    });
    expect(res.status()).toBe(200);

    const body = await jsonOf<{ cancelled: boolean; forfeited: boolean }>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.data.cancelled).toBe(true);
    expect(body.data.forfeited, "lo que la app anunció al socio antes de confirmar").toBe(true);

    expect(await balanceOf(socio.subscriptionId), "la sesión se pierde, como si se hubiera asistido").toBe(before);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: tarde.bookingId } });
    expect(booking.status).toBe("CANCELLED");
  });

  test("cancelar con antelación sí devuelve, y deja asiento", async ({ request }) => {
    const { session, data } = await agenda(request);
    const holgada = data.upcomingBookings.find((b) => b.sessionId === holgado.sessionId)!;
    const before = await balanceOf(socio.subscriptionId);

    const res = await request.post(`${API_PREFIX}/portal/agenda/${holgada.bookingId}/cancel`, {
      headers: bearer(session),
    });
    expect(res.status()).toBe(200);

    const body = await jsonOf<{ forfeited: boolean }>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.data.forfeited).toBe(false);
    expect(before, "el bono del fixture tiene saldo contable, no es ilimitado").not.toBeNull();
    expect(await balanceOf(socio.subscriptionId)).toBe(before! + 1);

    const entries = await prisma.sessionLedger.findMany({
      where: { subscriptionId: socio.subscriptionId },
      select: { delta: true, reason: true },
      orderBy: { createdAt: "asc" },
    });
    // Dos reservas (−1, −1) y una sola devolución (+1): la tardía no aparece.
    expect(entries.map((e) => e.delta)).toEqual([-1, -1, 1]);
    expect(entries[2].reason).toBe("CANCELLATION");
  });

  test("la lista de espera ni descuenta ni se penaliza al salirse", async ({ request }) => {
    const otro = await createFixtureMember(ctx, TAG, 2, 5);
    const llena = await createFixtureSession(ctx, `${TAG}-llena`, {
      capacity: 1,
      startsInHours: Math.max(1, CANCEL_WINDOW_HOURS - 2),
    });
    // La plaza única se la queda otro socio; el nuestro entra a la cola.
    await prisma.booking.create({
      data: { sessionId: llena.sessionId, occurrenceDate: llena.day, memberId: socio.memberId, status: "BOOKED" },
    });

    const session = await mobileLogin(request, otro.email, FIXTURE_PASSWORD);
    const booked = await request.post(`${API_PREFIX}/portal/agenda/book`, {
      headers: bearer(session),
      data: { sessionId: llena.sessionId, occurrenceDate: dateParam(llena.day) },
    });
    expect(booked.status()).toBe(200);
    const bookedBody = await jsonOf<{ waitlisted: boolean }>(booked);
    expect(bookedBody.ok).toBe(true);
    if (!bookedBody.ok) return;
    expect(bookedBody.data.waitlisted, "la clase está llena: entra en lista de espera").toBe(true);
    expect(await balanceOf(otro.subscriptionId), "esperar no cuesta sesión").toBe(5);

    const waitlisted = await prisma.booking.findFirstOrThrow({
      where: { sessionId: llena.sessionId, memberId: otro.memberId },
    });
    expect(waitlisted.status).toBe("WAITLISTED");

    // Salirse de la cola dentro de la ventana no penaliza: nunca se descontó.
    const cancel = await request.post(`${API_PREFIX}/portal/agenda/${waitlisted.id}/cancel`, {
      headers: bearer(session),
    });
    expect(cancel.status()).toBe(200);
    const cancelBody = await jsonOf<{ forfeited: boolean }>(cancel);
    expect(cancelBody.ok).toBe(true);
    if (!cancelBody.ok) return;
    expect(cancelBody.data.forfeited).toBe(false);
    expect(await balanceOf(otro.subscriptionId)).toBe(5);
    expect(await prisma.sessionLedger.count({ where: { subscriptionId: otro.subscriptionId } })).toBe(0);
  });

  test("la reserva de otro socio no se cancela con el token propio", async ({ request }) => {
    const ajeno = await createFixtureMember(ctx, TAG, 3, 5);
    const suya = await createFixtureSession(ctx, `${TAG}-ajena`, { capacity: 6, startsInHours: 72 });
    const booking = await prisma.booking.create({
      data: {
        sessionId: suya.sessionId,
        occurrenceDate: suya.day,
        memberId: ajeno.memberId,
        status: "BOOKED",
        subscriptionId: ajeno.subscriptionId,
      },
    });

    const session = await mobileLogin(request, socio.email, FIXTURE_PASSWORD);
    const res = await request.post(`${API_PREFIX}/portal/agenda/${booking.id}/cancel`, { headers: bearer(session) });

    expect(res.status()).toBe(400);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("BOOKED");
  });
});

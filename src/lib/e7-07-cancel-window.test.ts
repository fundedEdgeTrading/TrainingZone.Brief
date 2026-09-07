import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { CANCEL_WINDOW_HOURS, cancelBookingForMember, enforcementStartsAt } from "@/lib/portal-queries";
import {
  balanceOf,
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * E7-07 · U3 y U4 — la ventana de cancelación, medida contra la base y contra
 * la zona horaria del CENTRO.
 *
 * `cancel-window.test.ts` prueba el predicado. Aquí se prueba la consecuencia,
 * que es lo que el socio nota: a un minuto de un lado la sesión vuelve al bono
 * y al otro se pierde. Los dos casos se montan a partir de
 * `CANCEL_WINDOW_HOURS`, no de un 24 escrito a mano: si la configuración
 * cambia, estos tests siguen probando la regla y no un número.
 *
 * U4 es el mismo veredicto con el centro en `America/Lima`. Importa porque la
 * hora de una clase no es un instante: `ClassSession.date` guarda el día y
 * `startTime` es RELOJ DE PARED del centro. Medir esa hora con la zona del
 * servidor —o peor, con la del navegador del socio— desplaza la ventana entera
 * tantas horas como diferencia haya, y entonces el distintivo "cancelable sin
 * penalización" promete una cosa y el botón hace otra.
 */

const TAG = "u3-ventana";
const MINUTE = 60 * 1000;
const WINDOW_MS = CANCEL_WINDOW_HOURS * 60 * 60 * 1000;

let madrid: RegressionOrg;
let lima: RegressionOrg;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  madrid = await createRegressionOrg(`${TAG}-madrid`, "Europe/Madrid");
  lima = await createRegressionOrg(`${TAG}-lima`, "America/Lima");
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

/**
 * Día y hora de pared que, EN ESA ZONA, corresponden al instante pedido.
 *
 * Es la traducción inversa de lo que hace `enforcementStartsAt`: sin ella no se
 * puede montar "una clase que empieza exactamente dentro de la ventana + 1
 * minuto" en un centro de Lima, porque escribir "18:00" allí es un instante
 * distinto que aquí — que es justo el fallo que U4 vigila.
 */
function wallClockIn(timezone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  // El día suelto se guarda a medianoche LOCAL DEL SERVIDOR (es como lo escribe
  // toda la aplicación), y la hora viaja aparte como reloj de pared del centro.
  const day = new Date(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  return { day, startTime: `${get("hour")}:${get("minute")}` };
}

let seq = 0;

/** Reserva viva de una clase que empieza en `startsAt`, con bono consumido. */
async function bookingStartingAt(org: RegressionOrg, timezone: string, startsAt: Date, status: "BOOKED" | "WAITLISTED") {
  const socio = await createRegressionMember(org, `${TAG}${seq}`, ++seq, 5);
  const { day, startTime } = wallClockIn(timezone, startsAt);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name: `clase-${seq}`,
      classType: "Grupo reducido",
      date: day,
      startTime,
      endTime: startTime,
      capacity: 6,
    },
  });
  const booking = await prisma.booking.create({
    data: {
      sessionId: session.id,
      occurrenceDate: day,
      memberId: socio.id,
      status,
      subscriptionId: status === "BOOKED" ? socio.subscriptionId : null,
      waitlistPosition: status === "WAITLISTED" ? 1 : null,
    },
  });
  if (status === "BOOKED") {
    // La reserva ya descontó: es el punto de partida real de una cancelación.
    await prisma.subscription.update({ where: { id: socio.subscriptionId }, data: { sessionsRemaining: 4 } });
  }

  // El montaje tiene que caer donde se pretende, o el test mediría otra cosa.
  const resolved = enforcementStartsAt(day, startTime, timezone);
  assert.ok(
    Math.abs(resolved.getTime() - startsAt.getTime()) < MINUTE,
    `la clase se ha montado en ${resolved.toISOString()} en vez de ${startsAt.toISOString()}`
  );

  return { socio, bookingId: booking.id, startsAt: resolved };
}

test("U3 · a la ventana + 1 minuto, cancelar devuelve la sesión al bono", async () => {
  const { socio, bookingId } = await bookingStartingAt(
    madrid,
    "Europe/Madrid",
    new Date(Date.now() + WINDOW_MS + MINUTE),
    "BOOKED"
  );

  const result = await cancelBookingForMember(socio.id, bookingId);
  assert.equal(result.ok, true);
  assert.equal(result.ok && Boolean(result.forfeited), false);
  assert.equal(await balanceOf(socio.subscriptionId), 5, "por un minuto, la sesión vuelve entera");

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assert.equal(booking.status, "CANCELLED");
  assert.equal(booking.subscriptionId, null, "al devolver la sesión, la reserva suelta el bono");
});

test("U3 · a la ventana − 1 minuto, la sesión se pierde y se dice", async () => {
  const { socio, bookingId } = await bookingStartingAt(
    madrid,
    "Europe/Madrid",
    new Date(Date.now() + WINDOW_MS - MINUTE),
    "BOOKED"
  );

  const result = await cancelBookingForMember(socio.id, bookingId);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.forfeited, true, "el aviso que la pantalla enseñó antes de confirmar");
  assert.equal(await balanceOf(socio.subscriptionId), 4, "queda como empleada, igual que si se hubiera asistido");
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status, "CANCELLED");
});

test("U3 · la penalización no inventa asientos: el libro solo anota lo que se devuelve", async () => {
  const dentro = await bookingStartingAt(madrid, "Europe/Madrid", new Date(Date.now() + WINDOW_MS - MINUTE), "BOOKED");
  await cancelBookingForMember(dentro.socio.id, dentro.bookingId);
  assert.equal(
    await prisma.sessionLedger.count({ where: { subscriptionId: dentro.socio.subscriptionId } }),
    0,
    "cancelar tarde no mueve el saldo, así que no hay nada que anotar"
  );

  const fuera = await bookingStartingAt(madrid, "Europe/Madrid", new Date(Date.now() + WINDOW_MS + MINUTE), "BOOKED");
  await cancelBookingForMember(fuera.socio.id, fuera.bookingId);
  const entries = await prisma.sessionLedger.findMany({
    where: { subscriptionId: fuera.socio.subscriptionId },
    select: { delta: true, reason: true },
  });
  assert.deepEqual(entries, [{ delta: 1, reason: "CANCELLATION" }]);
});

test("U3 · la lista de espera nunca reembolsa, ni dentro ni fuera de la ventana", async () => {
  for (const offset of [WINDOW_MS + MINUTE, WINDOW_MS - MINUTE]) {
    const { socio, bookingId } = await bookingStartingAt(
      madrid,
      "Europe/Madrid",
      new Date(Date.now() + offset),
      "WAITLISTED"
    );
    const before = await balanceOf(socio.subscriptionId);

    const result = await cancelBookingForMember(socio.id, bookingId);
    assert.equal(result.ok, true);
    assert.equal(result.ok && Boolean(result.forfeited), false, "nunca descontó: no hay nada que perder");
    assert.equal(await balanceOf(socio.subscriptionId), before, "ni nada que devolver");
    assert.equal(await prisma.sessionLedger.count({ where: { subscriptionId: socio.subscriptionId } }), 0);
  }
});

test("U4 · el veredicto es el mismo con el centro en America/Lima", async () => {
  // Mismo instante real, distinto reloj de pared: si la ventana se midiera con
  // la zona del servidor, estas dos cancelaciones darían lo contrario.
  const fuera = await bookingStartingAt(lima, "America/Lima", new Date(Date.now() + WINDOW_MS + MINUTE), "BOOKED");
  const dentro = await bookingStartingAt(lima, "America/Lima", new Date(Date.now() + WINDOW_MS - MINUTE), "BOOKED");

  const libre = await cancelBookingForMember(fuera.socio.id, fuera.bookingId);
  assert.equal(libre.ok && Boolean(libre.forfeited), false);
  assert.equal(await balanceOf(fuera.socio.subscriptionId), 5);

  const tarde = await cancelBookingForMember(dentro.socio.id, dentro.bookingId);
  assert.equal(tarde.ok && tarde.forfeited, true);
  assert.equal(await balanceOf(dentro.socio.subscriptionId), 4);
});

test("U4 · la misma hora de pared en dos zonas NO es el mismo instante", async () => {
  // El motivo por el que U4 existe, comprobado sobre las dos filas: "18:00" en
  // Lima ocurre horas después que "18:00" en Madrid, y la ventana se mide
  // contra el instante, no contra el texto.
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const enMadrid = enforcementStartsAt(day, "18:00", "Europe/Madrid");
  const enLima = enforcementStartsAt(day, "18:00", "America/Lima");

  assert.notEqual(enMadrid.getTime(), enLima.getTime());
  assert.ok(enLima.getTime() > enMadrid.getTime(), "Lima va por detrás de Madrid: su 18:00 llega más tarde");
});

test("U4 · una clase que ya ha empezado no se cancela, se mida donde se mida", async () => {
  const { socio, bookingId } = await bookingStartingAt(lima, "America/Lima", new Date(Date.now() - MINUTE), "BOOKED");

  const result = await cancelBookingForMember(socio.id, bookingId);
  assert.equal(result.ok, false);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status, "BOOKED");
  assert.equal(await balanceOf(socio.subscriptionId), 4, "y no se le devuelve nada por intentarlo");
});

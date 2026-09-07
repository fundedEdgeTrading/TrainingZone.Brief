import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { mobileLogin, bearer, jsonOf, API_PREFIX } from "./fixtures/mobile-api";
import {
  cleanupFixtures,
  createFixtureMember,
  createFixtureSession,
  fixtureContext,
  type FixtureContext,
  type FixtureMember,
} from "./fixtures/mobile-members";

/**
 * E7-06 · E3 — recepción no recibe `feedbackAvg` ni en la ficha ni en el
 * calendario del socio.
 *
 * La media del debrief promedia movilidad y **dolor invertido**: es dato de
 * salud (RB-SEG-004), y la matriz de permisos deja fuera a recepción
 * (`canViewHealthData`). Lo que hace falta probar contra la API es que la clave
 * NO VIENE: ni con valor ni como `null`. Un `null` sigue diciendo "aquí hay un
 * dato de salud que no te toca", y sobre todo es la forma en que esta fuga pasó
 * desapercibida —con el seed salía `null` porque nadie había puntuado ejes—.
 *
 * Por eso el fixture puntúa de verdad: sin un debrief con dolor escrito, el
 * test pasaría igual con la fuga abierta.
 *
 * El contraste con dirección de centro es parte de la prueba: si el dato no
 * llegara a NADIE, el módulo estaría roto, no protegido. Y esa lectura deja
 * `AuditLog` (E3-18), que también se comprueba.
 */

const TAG = "salud";
const RECEPTION = "recepcion.lajota@trainingzone.es";
const CENTER_DIRECTOR = "direccion.lajota@trainingzone.es";

type CalendarDto = {
  month: string;
  entries: (Record<string, unknown> & { bookingId: string })[];
  summary: { attended: number; booked: number; noShow: number };
};
type MemberBooking = Record<string, unknown> & { bookingId: string };
/** La ficha parte las reservas en dos listas; la del fixture es pasada. */
type MemberDetailDto = { upcoming: MemberBooking[]; recent: MemberBooking[] };

let ctx: FixtureContext;
let socio: FixtureMember;
let bookingId: string;

test.beforeAll(async () => {
  await cleanupFixtures();
  ctx = await fixtureContext(TAG);
  socio = await createFixtureMember(ctx, TAG, 1, 5);

  // Sesión ya pasada y asistida: es la única que puede tener debrief.
  const { sessionId, day } = await createFixtureSession(ctx, TAG, { capacity: 6, startsInHours: -24 });
  const booking = await prisma.booking.create({
    data: {
      sessionId,
      occurrenceDate: day,
      memberId: socio.memberId,
      status: "ATTENDED",
      subscriptionId: socio.subscriptionId,
    },
  });
  bookingId = booking.id;

  await prisma.sessionDebrief.create({
    data: {
      bookingId: booking.id,
      feeling: "GREEN",
      rpe: 7,
      technique: 8,
      attitude: 9,
      energy: 7,
      mobility: 6,
      // El eje que convierte la media en dato de salud.
      pain: 3,
      adherence: 8,
      progress: 7,
    },
  });
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

/** Mes del día de ayer, que es donde cae la sesión del fixture. */
function monthOfYesterday() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

test.describe("E7-06 · E3 — la media del debrief es dato de salud", () => {
  test("la ficha del socio no trae feedbackAvg para recepción, ni siquiera como null", async ({ request }) => {
    const reception = await mobileLogin(request, RECEPTION);
    const res = await request.get(`${API_PREFIX}/members/${socio.memberId}`, { headers: bearer(reception) });
    expect(res.status()).toBe(200);

    const body = await jsonOf<MemberDetailDto>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const all = [...body.data.upcoming, ...body.data.recent];
    const booking = all.find((b) => b.bookingId === bookingId);
    expect(booking, "la reserva del fixture tiene que venir en la ficha").toBeTruthy();
    expect(Object.keys(booking!), "un null también dice que ahí hay un dato de salud").not.toContain("feedbackAvg");
    expect(all.some((b) => "feedbackAvg" in b)).toBe(false);
  });

  test("el calendario tampoco lo trae para recepción", async ({ request }) => {
    const reception = await mobileLogin(request, RECEPTION);
    const res = await request.get(
      `${API_PREFIX}/members/${socio.memberId}/calendar?month=${monthOfYesterday()}`,
      { headers: bearer(reception) }
    );
    expect(res.status()).toBe(200);

    const body = await jsonOf<CalendarDto>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const entry = body.data.entries.find((e) => e.bookingId === bookingId);
    expect(entry, "la sesión asistida tiene que estar en el calendario del mes").toBeTruthy();
    expect(Object.keys(entry!)).not.toContain("feedbackAvg");
  });

  test("la lectura de recepción no escribe traza de salud: no ha leído ninguna", async ({ request }) => {
    const before = await prisma.auditLog.count({
      where: { memberId: socio.memberId, action: "SESSION_DEBRIEF_PAIN_READ" },
    });
    const reception = await mobileLogin(request, RECEPTION);
    await request.get(`${API_PREFIX}/members/${socio.memberId}/calendar?month=${monthOfYesterday()}`, {
      headers: bearer(reception),
    });

    expect(
      await prisma.auditLog.count({ where: { memberId: socio.memberId, action: "SESSION_DEBRIEF_PAIN_READ" } })
    ).toBe(before);
  });

  test("dirección de centro sí lo recibe, y con el valor calculado", async ({ request }) => {
    const director = await mobileLogin(request, CENTER_DIRECTOR);
    const res = await request.get(
      `${API_PREFIX}/members/${socio.memberId}/calendar?month=${monthOfYesterday()}`,
      { headers: bearer(director) }
    );
    expect(res.status()).toBe(200);

    const body = await jsonOf<CalendarDto>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const entry = body.data.entries.find((e) => e.bookingId === bookingId);
    expect(entry).toBeTruthy();
    // (8+9+7+6+8+7 + (11-3)) / 7 = 7.6 — con el dolor invertido dentro.
    expect(entry!.feedbackAvg).toBe(7.6);
  });

  test("y esa lectura de dirección sí deja AuditLog (E3-18)", async ({ request }) => {
    const before = await prisma.auditLog.count({
      where: { memberId: socio.memberId, action: "SESSION_DEBRIEF_PAIN_READ" },
    });
    const director = await mobileLogin(request, CENTER_DIRECTOR);
    await request.get(`${API_PREFIX}/members/${socio.memberId}/calendar?month=${monthOfYesterday()}`, {
      headers: bearer(director),
    });

    const after = await prisma.auditLog.findMany({
      where: { memberId: socio.memberId, action: "SESSION_DEBRIEF_PAIN_READ" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    expect(after.length).toBe(before + 1);
    expect(after[0].metadata).toMatchObject({ source: "MEMBER_CALENDAR" });
  });

  test("un entrenador no entra por esta puerta, y sin token tampoco", async ({ request }) => {
    const trainer = await mobileLogin(request, "entrenador@trainingzone.es");
    const forbidden = await request.get(`${API_PREFIX}/members/${socio.memberId}/calendar`, {
      headers: bearer(trainer),
    });
    expect(forbidden.status()).toBe(403);

    const anonymous = await request.get(`${API_PREFIX}/members/${socio.memberId}/calendar`);
    expect(anonymous.status()).toBe(401);
  });
});

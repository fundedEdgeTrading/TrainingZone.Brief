import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
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
 * E7-06 · E6 — al borrar una sesión desde el móvil, los apuntados recuperan su
 * sesión de bono.
 *
 * Es la escritura que más daño hace de toda la API: un borrado que no devuelve
 * deja a tres socios con una sesión menos por una clase que nadie dio, y el
 * descuadre no aparece hasta semanas después, cuando el bono se agota antes de
 * tiempo. Por eso el test comprueba las TRES cosas que tienen que pasar juntas:
 *
 *  1. El saldo vuelve al bono de cada uno (RB-RES-006).
 *  2. Queda asiento en `SessionLedger`: ninguna operación mueve
 *     `sessionsRemaining` sin escribir en el libro.
 *  3. Queda `AuditLog` por devolución —una por socio, no una por borrado—, que
 *     es lo que permite cuadrar sesión a sesión.
 *
 * Las reservas se hacen por la API del socio, no escribiendo filas a mano: si
 * el descuento y la devolución no son simétricos, el test tiene que verlo.
 */

const TAG = "borrado";
const CENTER_DIRECTOR = "direccion.lajota@trainingzone.es";

let ctx: FixtureContext;
let socios: FixtureMember[];
let sessionId: string;
let day: Date;

test.beforeAll(async ({ request }) => {
  await cleanupFixtures();
  ctx = await fixtureContext(TAG);
  socios = [
    await createFixtureMember(ctx, TAG, 1, 5),
    await createFixtureMember(ctx, TAG, 2, 5),
    await createFixtureMember(ctx, TAG, 3, 5),
  ];

  // Bien lejos de la ventana de cancelación: lo que se prueba es el borrado,
  // no la penalización por cancelar tarde.
  const created = await createFixtureSession(ctx, TAG, { capacity: 6, startsInHours: 72 });
  sessionId = created.sessionId;
  day = created.day;

  for (const socio of socios) {
    const session = await mobileLogin(request, socio.email, FIXTURE_PASSWORD);
    const res = await request.post(`${API_PREFIX}/portal/agenda/book`, {
      headers: bearer(session),
      data: { sessionId, occurrenceDate: dateParam(day) },
    });
    expect(res.status(), `${socio.email} tiene que poder reservar`).toBe(200);
  }
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

test.describe("E7-06 · E6 — borrar una sesión devuelve el bono a los apuntados", () => {
  test("reservar ha descontado a los tres: el punto de partida es el real", async () => {
    for (const socio of socios) {
      expect(await balanceOf(socio.subscriptionId)).toBe(4);
    }
    expect(await prisma.booking.count({ where: { sessionId, status: "BOOKED" } })).toBe(3);
  });

  test("el borrado responde 200 y dice cuántas devoluciones ha hecho", async ({ request }) => {
    const director = await mobileLogin(request, CENTER_DIRECTOR);
    const res = await request.delete(`${API_PREFIX}/agenda/sessions/${sessionId}`, { headers: bearer(director) });

    expect(res.status()).toBe(200);
    const body = await jsonOf<{ deleted: boolean; refunded: number }>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.data.deleted).toBe(true);
    expect(body.data.refunded).toBe(3);
  });

  test("los tres socios recuperan su sesión", async () => {
    for (const socio of socios) {
      expect(await balanceOf(socio.subscriptionId), `${socio.email} tiene que volver a 5`).toBe(5);
    }
  });

  test("cada devolución deja asiento en SessionLedger", async () => {
    for (const socio of socios) {
      const entries = await prisma.sessionLedger.findMany({
        where: { subscriptionId: socio.subscriptionId },
        select: { delta: true, reason: true },
        orderBy: { createdAt: "asc" },
      });
      // −1 al reservar, +1 al devolver: el libro cuadra a cero y el saldo
      // vuelve a ser el de partida.
      expect(entries.map((e) => e.delta)).toEqual([-1, 1]);
      expect(entries.reduce((sum, e) => sum + e.delta, 0)).toBe(0);
      expect(entries[1].reason).toBe("CANCELLATION");
    }
  });

  test("y una entrada de auditoría por socio, no una por borrado", async () => {
    const audits = await prisma.auditLog.findMany({
      where: { action: "SESSION_DELETED", memberId: { in: socios.map((s) => s.memberId) } },
      select: { memberId: true, metadata: true },
    });

    expect(audits.length).toBe(3);
    expect([...new Set(audits.map((a) => a.memberId))].sort()).toEqual(socios.map((s) => s.memberId).sort());
    for (const audit of audits) {
      expect(audit.metadata).toMatchObject({ sessionId, refunded: true });
    }
  });

  test("la sesión y sus reservas ya no están", async () => {
    expect(await prisma.classSession.count({ where: { id: sessionId } })).toBe(0);
    expect(await prisma.booking.count({ where: { sessionId } })).toBe(0);
  });

  test("una sesión con asistencia registrada no se borra a la primera: 409 y nada tocado", async ({ request }) => {
    const otra = await createFixtureSession(ctx, `${TAG}-asistida`, { capacity: 6, startsInHours: -48 });
    const socio = socios[0];
    await prisma.booking.create({
      data: {
        sessionId: otra.sessionId,
        occurrenceDate: otra.day,
        memberId: socio.memberId,
        status: "ATTENDED",
        subscriptionId: socio.subscriptionId,
      },
    });
    const before = await balanceOf(socio.subscriptionId);

    const director = await mobileLogin(request, CENTER_DIRECTOR);
    const first = await request.delete(`${API_PREFIX}/agenda/sessions/${otra.sessionId}`, {
      headers: bearer(director),
    });
    // 409 y no 404: la sesión existe y está en ámbito. Lo que falta es la
    // decisión de quien borra (RB-AGENDA-010).
    expect(first.status()).toBe(409);
    expect(await prisma.classSession.count({ where: { id: otra.sessionId } })).toBe(1);
    expect(await balanceOf(socio.subscriptionId)).toBe(before);

    // Con la confirmación sí se borra, y la asistencia no devuelve nada: una
    // sesión que se dio, se dio.
    const confirmed = await request.delete(
      `${API_PREFIX}/agenda/sessions/${otra.sessionId}?confirmSettled=1`,
      { headers: bearer(director) }
    );
    expect(confirmed.status()).toBe(200);
    expect(await balanceOf(socio.subscriptionId)).toBe(before);
    expect(await prisma.classSession.count({ where: { id: otra.sessionId } })).toBe(0);
  });
});

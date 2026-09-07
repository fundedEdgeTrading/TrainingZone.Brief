import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { CANCEL_WINDOW_HOURS } from "@/lib/portal-queries";
import { mobileLogin, bearer, jsonOf, API_PREFIX } from "./fixtures/mobile-api";
import { dismissPortalGates, loginAs } from "./helpers";
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
 * E7-06 · E8 — reservar y cancelar la MISMA clase por web y por API deja el
 * mismo estado y el mismo saldo.
 *
 * Es el spec que cierra la historia y el que justifica los otros siete: la
 * paridad web↔móvil no se rompe de golpe, se rompe en silencio, cuando una de
 * las dos puertas empieza a escribir distinto que la otra sobre las mismas
 * filas. Los hallazgos del informe son todos de esa forma.
 *
 * Dos socios gemelos —mismo bono, mismo centro, mismo saldo— hacen exactamente
 * lo mismo sobre exactamente la misma clase, uno pulsando en el portal y otro
 * llamando al endpoint. Al final se comparan las tres cosas que el socio nota:
 * el estado de su reserva, el saldo de su bono y lo que quedó escrito en el
 * libro de sesiones.
 *
 * La clase se programa lejos de la ventana de cancelación para que la
 * comparación no dependa de la hora a la que se ejecute la suite: aquí se
 * prueba la paridad, no la penalización (eso es E7).
 */

const TAG = "paridad";

let ctx: FixtureContext;
let porWeb: FixtureMember;
let porApi: FixtureMember;
let sessionId: string;
let day: Date;
let sessionName: string;

type BookingState = {
  status: string;
  hasSubscription: boolean;
  balance: number | null;
  ledger: { delta: number; reason: string }[];
};

/** Lo que el socio nota, resumido igual para los dos caminos. */
async function stateOf(member: FixtureMember): Promise<BookingState> {
  const booking = await prisma.booking.findFirstOrThrow({
    where: { sessionId, memberId: member.memberId },
    select: { status: true, subscriptionId: true },
  });
  const ledger = await prisma.sessionLedger.findMany({
    where: { subscriptionId: member.subscriptionId },
    select: { delta: true, reason: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    status: booking.status,
    hasSubscription: booking.subscriptionId !== null,
    balance: await balanceOf(member.subscriptionId),
    ledger,
  };
}

test.beforeAll(async () => {
  await cleanupFixtures();
  ctx = await fixtureContext(TAG);
  porWeb = await createFixtureMember(ctx, TAG, 1, 5);
  porApi = await createFixtureMember(ctx, TAG, 2, 5);

  const created = await createFixtureSession(ctx, TAG, {
    capacity: 4,
    startsInHours: CANCEL_WINDOW_HOURS + 48,
  });
  sessionId = created.sessionId;
  day = created.day;
  sessionName = (
    await prisma.classSession.findUniqueOrThrow({ where: { id: sessionId }, select: { name: true } })
  ).name;
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

test.describe("E7-06 · E8 — la misma clase por las dos puertas", () => {
  test("reservar por web y por API deja el mismo estado y el mismo saldo", async ({ page, request }) => {
    // El portal es varias vueltas de navegación y toast: el timeout por defecto
    // se queda corto en una máquina lenta.
    test.setTimeout(90_000);

    // --- Puerta 1: el portal web ---------------------------------------------
    await loginAs(page, porWeb.email, FIXTURE_PASSWORD);
    await page.goto("/portal/agenda");
    await dismissPortalGates(page);

    const card = page.getByRole("article").filter({ hasText: sessionName });
    await expect(card, "la clase del fixture tiene que ofrecerse en el portal").toHaveCount(1);
    await card.getByRole("button", { name: "Reservar", exact: true }).click();
    await expect(page.locator(".tz-toast").first()).toBeVisible({ timeout: 15_000 });

    // --- Puerta 2: la API móvil ----------------------------------------------
    const apiSession = await mobileLogin(request, porApi.email, FIXTURE_PASSWORD);
    const booked = await request.post(`${API_PREFIX}/portal/agenda/book`, {
      headers: bearer(apiSession),
      data: { sessionId, occurrenceDate: dateParam(day) },
    });
    expect(booked.status()).toBe(200);

    const web = await stateOf(porWeb);
    const api = await stateOf(porApi);

    expect(web).toEqual(api);
    // Y no se comparan dos estados vacíos: la reserva existe y ha cobrado.
    expect(web.status).toBe("BOOKED");
    expect(web.hasSubscription, "la reserva recuerda de qué bono salió, o al cancelar no hay a dónde devolverla").toBe(
      true
    );
    expect(web.balance).toBe(4);
    expect(web.ledger).toEqual([{ delta: -1, reason: "BOOKING" }]);
  });

  test("cancelar por web y por API también converge", async ({ page, request }) => {
    test.setTimeout(90_000);

    // --- Puerta 1: el portal web ---------------------------------------------
    await loginAs(page, porWeb.email, FIXTURE_PASSWORD);
    await page.goto("/portal/agenda");
    await dismissPortalGates(page);

    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    await panel.waitFor({ state: "visible", timeout: 15_000 });
    // El socio del fixture nace sin historial: su única reserva viva es la que
    // acaba de hacer el test, así que no hace falta distinguir filas —y de paso
    // se comprueba que reservar no le dejó dos—.
    const cancel = panel.getByRole("button", { name: /Cancelar/ });
    await expect(cancel).toHaveCount(1);
    await expect(panel).toContainText(sessionName);
    await cancel.click();
    await expect(page.locator(".tz-toast").first()).toBeVisible({ timeout: 15_000 });

    // --- Puerta 2: la API móvil ----------------------------------------------
    const apiSession = await mobileLogin(request, porApi.email, FIXTURE_PASSWORD);
    const booking = await prisma.booking.findFirstOrThrow({
      where: { sessionId, memberId: porApi.memberId },
      select: { id: true },
    });
    const cancelled = await request.post(`${API_PREFIX}/portal/agenda/${booking.id}/cancel`, {
      headers: bearer(apiSession),
    });
    expect(cancelled.status()).toBe(200);
    const body = await jsonOf<{ forfeited: boolean }>(cancelled);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.data.forfeited, "la clase está lejos de la ventana: cancelar no penaliza").toBe(false);

    const web = await stateOf(porWeb);
    const api = await stateOf(porApi);

    expect(web).toEqual(api);
    expect(web.status).toBe("CANCELLED");
    expect(web.hasSubscription, "al devolver la sesión, la reserva suelta el bono").toBe(false);
    expect(web.balance).toBe(5);
    expect(web.ledger.map((e) => e.delta)).toEqual([-1, 1]);
  });

  test("y la clase queda igual de libre por los dos caminos", async () => {
    const active = await prisma.booking.count({
      where: { sessionId, status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
    });
    expect(active).toBe(0);
  });
});

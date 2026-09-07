import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { mobileLogin, bearer, jsonOf, API_PREFIX } from "./fixtures/mobile-api";
import {
  cleanupFixtures,
  createFixtureSession,
  fixtureContext,
  type FixtureContext,
} from "./fixtures/mobile-members";

/**
 * E7-06 · E4 — el Session Brief móvil no cruza de centro.
 *
 * Dos superficies y las dos hacen falta:
 *
 *  - El ÍNDICE (`GET /trainer/brief`), que es donde una sesión ajena se ve sin
 *    haberla buscado.
 *  - El DETALLE (`GET /trainer/brief/[id]`), que es donde se abre: el índice
 *    puede estar bien filtrado y el detalle seguir contestando por id — de
 *    hecho es el patrón exacto del agujero de E6-02 en la web, donde `/brief`
 *    redirigía y `/brief/<id>` respondía 200 con el semáforo completo.
 *
 * Y el brief es la pantalla con más dato de salud por pulgada de toda la
 * aplicación: semáforo de aptitud, condiciones declaradas y zona de lesión de
 * cada persona del roster.
 */

const TAG = "brief";
const LA_JOTA_DIRECTOR = "direccion.lajota@trainingzone.es";
const SANTANDER_DIRECTOR = "director1.santander@trainingzone.es";

type BriefIndex = { sessions: { id: string; name: string; centerName: string }[] };
type BriefDetail = { session: { id: string; centerName: string }; canSeeHealth: boolean; roster: unknown[] };

let ctx: FixtureContext;
let laJotaSessionId: string;
let santanderSessionId: string;
let santanderCenterId: string;

test.beforeAll(async () => {
  await cleanupFixtures();
  ctx = await fixtureContext(TAG);

  const santanderCenter = await prisma.center.findFirstOrThrow({
    where: { orgId: ctx.orgId, name: { contains: "Santander" } },
    select: { id: true },
  });
  const santanderTrainer = await prisma.user.findFirstOrThrow({
    where: { email: "entrenador1.santander@trainingzone.es" },
    select: { id: true },
  });
  santanderCenterId = santanderCenter.id;

  // Mañana: dentro de la ventana de tres días del índice, y sin depender de la
  // hora a la que se ejecute la suite.
  const propia = await createFixtureSession(ctx, `${TAG}-propia`, { capacity: 8, startsInHours: 24 });
  const ajena = await createFixtureSession(ctx, `${TAG}-ajena`, {
    capacity: 8,
    startsInHours: 24,
    centerId: santanderCenter.id,
    trainerId: santanderTrainer.id,
  });
  laJotaSessionId = propia.sessionId;
  santanderSessionId = ajena.sessionId;
});

test.afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

test.describe("E7-06 · E4 — Session Brief: ni se ve ni se abre fuera del centro", () => {
  test("el índice de dirección de La Jota no lista la sesión de Santander", async ({ request }) => {
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const res = await request.get(`${API_PREFIX}/trainer/brief`, { headers: bearer(director) });
    expect(res.status()).toBe(200);

    const body = await jsonOf<BriefIndex>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const ids = body.data.sessions.map((s) => s.id);
    expect(ids).not.toContain(santanderSessionId);
    // Control: su propia sesión sí está, o el test pasaría con el índice roto.
    expect(ids).toContain(laJotaSessionId);
    expect(
      body.data.sessions.every((s) => !s.centerName.includes("Santander")),
      "ninguna fila del índice puede ser de otro centro"
    ).toBe(true);
  });

  test("el detalle responde 404 por id, que es por donde se abría", async ({ request }) => {
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const res = await request.get(`${API_PREFIX}/trainer/brief/${santanderSessionId}`, {
      headers: bearer(director),
    });

    expect(res.status()).toBe(404);
    const body = await jsonOf<BriefDetail>(res);
    expect(body.ok).toBe(false);
  });

  test("y el mismo detalle de una sesión propia sí abre: el 404 es el ámbito", async ({ request }) => {
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const res = await request.get(`${API_PREFIX}/trainer/brief/${laJotaSessionId}`, { headers: bearer(director) });
    expect(res.status()).toBe(200);

    const body = await jsonOf<BriefDetail>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.data.session.id).toBe(laJotaSessionId);
    expect(body.data.canSeeHealth, "dirección de centro sí ve el semáforo de los suyos").toBe(true);
  });

  test("dirección de Santander ve la suya y no la de La Jota", async ({ request }) => {
    const director = await mobileLogin(request, SANTANDER_DIRECTOR);
    const body = await jsonOf<BriefIndex>(
      await request.get(`${API_PREFIX}/trainer/brief`, { headers: bearer(director) })
    );
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const ids = body.data.sessions.map((s) => s.id);
    expect(ids).toContain(santanderSessionId);
    expect(ids).not.toContain(laJotaSessionId);

    const detail = await request.get(`${API_PREFIX}/trainer/brief/${laJotaSessionId}`, { headers: bearer(director) });
    expect(detail.status()).toBe(404);
  });

  test("el ámbito no depende del día pedido: `?d=` tampoco abre la sesión ajena", async ({ request }) => {
    const director = await mobileLogin(request, LA_JOTA_DIRECTOR);
    const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const param = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

    const res = await request.get(`${API_PREFIX}/trainer/brief/${santanderSessionId}?d=${param}`, {
      headers: bearer(director),
    });
    expect(res.status()).toBe(404);
  });

  test("sin token no hay ni índice ni detalle", async ({ request }) => {
    expect((await request.get(`${API_PREFIX}/trainer/brief`)).status()).toBe(401);
    expect((await request.get(`${API_PREFIX}/trainer/brief/${laJotaSessionId}`)).status()).toBe(401);
  });

  test("el centro de Santander existe y es otro: el fixture prueba lo que dice", async () => {
    const session = await prisma.classSession.findUniqueOrThrow({
      where: { id: santanderSessionId },
      select: { centerId: true },
    });
    expect(session.centerId).toBe(santanderCenterId);
    expect(session.centerId).not.toBe(ctx.centerId);
  });
});

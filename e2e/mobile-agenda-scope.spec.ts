import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { mobileLogin, bearer, jsonOf, API_PREFIX, type MobileSession } from "./fixtures/mobile-api";
import { isoDay } from "./helpers";

/**
 * E7-06 · E1 — ámbito de centro en las TRES escrituras de agenda de la API móvil.
 *
 * Es uno de los dos specs bloqueantes de la historia, y el primero que se
 * escribe: no necesita interfaz (la app no tiene aún pantalla para todo esto) y
 * cubre el fallo que más veces se ha repetido en este código — la web comprueba
 * el ámbito de centro y el espejo móvil no.
 *
 * Lo que se prueba es que un TRAINER de La Jota no puede crear, editar ni
 * borrar sesiones de Santander. Los tres caminos tienen su propia forma de
 * fallar y por eso se prueban por separado:
 *
 *  - POST: el `centerId` llega del cliente. Sin comprobarlo, una entrenadora
 *    imputada solo a La Jota creaba una sesión en otro centro con un 200.
 *  - PATCH: hay DOS centros que mirar. El de destino (cuerpo) y el de ORIGEN
 *    (la sesión). Sin el de origen bastaba mandar el centro propio junto al id
 *    de una sesión ajena para reescribirla entera y traérsela de paso.
 *  - DELETE: además de borrar una sesión ajena, por E2-01 devuelve el bono de
 *    todos los apuntados: es la escritura que más daño hace.
 *
 * La respuesta correcta es 404, no 403: confirmar que el centro o la sesión
 * existen ya es filtrar información de otro centro.
 *
 * Cada aserción de código se acompaña de una comprobación en base de datos: un
 * 404 con la fila cambiada por detrás seguiría siendo la fuga.
 */

const TAG = "e2e-mobile-agenda-scope";
const LA_JOTA_TRAINER = "entrenador@trainingzone.es";

type Fixture = {
  orgId: string;
  laJotaCenterId: string;
  santanderCenterId: string;
  santanderTrainerId: string;
  santanderSessionId: string;
  laJotaTrainerId: string;
};

let fixture: Fixture;
let trainer: MobileSession;

/** Sesión desechable EN SANTANDER: los intentos de PATCH y DELETE necesitan un
 *  objetivo real, y no se toca la agenda de demo de ese centro. */
async function createFixture(): Promise<Fixture> {
  await cleanup();

  const laJotaTrainer = await prisma.user.findFirstOrThrow({
    where: { email: LA_JOTA_TRAINER },
    select: { id: true, orgId: true, centerId: true },
  });
  const santanderCenter = await prisma.center.findFirstOrThrow({
    where: { orgId: laJotaTrainer.orgId, name: { contains: "Santander" } },
    select: { id: true },
  });
  const santanderTrainer = await prisma.user.findFirstOrThrow({
    where: { email: "entrenador1.santander@trainingzone.es" },
    select: { id: true },
  });

  const session = await prisma.classSession.create({
    data: {
      orgId: laJotaTrainer.orgId,
      centerId: santanderCenter.id,
      trainerId: santanderTrainer.id,
      name: `${TAG} intocable`,
      classType: "Grupo reducido",
      date: new Date(`${isoDay(3)}T00:00:00.000Z`),
      startTime: "18:00",
      endTime: "19:00",
      capacity: 8,
    },
  });

  return {
    orgId: laJotaTrainer.orgId,
    laJotaCenterId: laJotaTrainer.centerId!,
    santanderCenterId: santanderCenter.id,
    santanderTrainerId: santanderTrainer.id,
    santanderSessionId: session.id,
    laJotaTrainerId: laJotaTrainer.id,
  };
}

async function cleanup() {
  const sessions = await prisma.classSession.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  if (sessions.length === 0) return;
  await prisma.booking.deleteMany({ where: { sessionId: { in: sessions.map((s) => s.id) } } });
  await prisma.classSession.deleteMany({ where: { id: { in: sessions.map((s) => s.id) } } });
}

/** Cuerpo completo de una escritura de agenda: al validador le faltan campos y
 *  responde 400 antes de llegar a la comprobación de ámbito, que es lo que se
 *  quiere probar. */
function sessionBody(over: Partial<Record<string, unknown>> = {}) {
  return {
    title: `${TAG} intento`,
    type: "reduced" as const,
    date: isoDay(3),
    startTime: "18:00",
    endTime: "19:00",
    capacity: 8,
    ...over,
  };
}

test.beforeAll(async ({ request }) => {
  fixture = await createFixture();
  trainer = await mobileLogin(request, LA_JOTA_TRAINER);
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test.describe("E7-06 · E1 — la agenda móvil no cruza de centro", () => {
  test("el token del entrenador de La Jota lleva su propio centro, no el que diga el cliente", async () => {
    // Si esto falla, el resto del spec no prueba lo que dice: el ámbito sale
    // del token firmado, nunca de un parámetro.
    expect(trainer.user.role).toBe("TRAINER");
    expect(trainer.user.centerId).toBe(fixture.laJotaCenterId);
    expect(trainer.user.centerId).not.toBe(fixture.santanderCenterId);
  });

  test("POST de una sesión en Santander responde 404 y no crea nada", async ({ request }) => {
    const before = await prisma.classSession.count({ where: { centerId: fixture.santanderCenterId } });

    const res = await request.post(`${API_PREFIX}/agenda/sessions`, {
      headers: bearer(trainer),
      data: sessionBody({ centerId: fixture.santanderCenterId, trainerId: fixture.santanderTrainerId }),
    });

    expect(res.status()).toBe(404);
    const body = await jsonOf<unknown>(res);
    expect(body.ok).toBe(false);

    expect(
      await prisma.classSession.count({ where: { centerId: fixture.santanderCenterId } }),
      "un 404 que igualmente escribe la fila sigue siendo la fuga"
    ).toBe(before);
    expect(await prisma.classSession.count({ where: { name: `${TAG} intento` } })).toBe(0);
  });

  test("POST en su propio centro sí funciona: el 404 anterior es el ámbito, no la ruta", async ({ request }) => {
    const res = await request.post(`${API_PREFIX}/agenda/sessions`, {
      headers: bearer(trainer),
      data: sessionBody({
        title: `${TAG} propia`,
        centerId: fixture.laJotaCenterId,
        trainerId: fixture.laJotaTrainerId,
      }),
    });

    expect(res.status()).toBe(200);
    const body = await jsonOf<{ id: string }>(res);
    expect(body.ok).toBe(true);
    if (!body.ok) return;

    const created = await prisma.classSession.findUniqueOrThrow({
      where: { id: body.data.id },
      select: { centerId: true },
    });
    expect(created.centerId).toBe(fixture.laJotaCenterId);
  });

  test("PATCH de una sesión de Santander responde 404 y la deja intacta", async ({ request }) => {
    const res = await request.patch(`${API_PREFIX}/agenda/sessions/${fixture.santanderSessionId}`, {
      headers: bearer(trainer),
      data: sessionBody({
        title: "AUDIT-HIJACKED",
        centerId: fixture.santanderCenterId,
        trainerId: fixture.santanderTrainerId,
      }),
    });

    expect(res.status()).toBe(404);
    const after = await prisma.classSession.findUniqueOrThrow({
      where: { id: fixture.santanderSessionId },
      select: { name: true, centerId: true },
    });
    expect(after.name).toBe(`${TAG} intocable`);
    expect(after.centerId).toBe(fixture.santanderCenterId);
  });

  test("PATCH con el centro propio en el cuerpo no se trae la sesión ajena", async ({ request }) => {
    // El camino del secuestro: id de la sesión ajena + `centerId` propio, para
    // que la comprobación del centro de DESTINO pase. Lo que lo corta es la del
    // centro de ORIGEN.
    const res = await request.patch(`${API_PREFIX}/agenda/sessions/${fixture.santanderSessionId}`, {
      headers: bearer(trainer),
      data: sessionBody({
        title: "AUDIT-HIJACKED",
        centerId: fixture.laJotaCenterId,
        trainerId: fixture.laJotaTrainerId,
      }),
    });

    expect(res.status()).toBe(404);
    const after = await prisma.classSession.findUniqueOrThrow({
      where: { id: fixture.santanderSessionId },
      select: { name: true, centerId: true, trainerId: true },
    });
    expect(after.name, "la sesión ajena no se reescribe").toBe(`${TAG} intocable`);
    expect(after.centerId, "y no cambia de centro").toBe(fixture.santanderCenterId);
    expect(after.trainerId).toBe(fixture.santanderTrainerId);
  });

  test("DELETE de una sesión de Santander responde 404 y no la borra", async ({ request }) => {
    const res = await request.delete(`${API_PREFIX}/agenda/sessions/${fixture.santanderSessionId}`, {
      headers: bearer(trainer),
    });

    expect(res.status()).toBe(404);
    expect(
      await prisma.classSession.count({ where: { id: fixture.santanderSessionId } }),
      "borrar una sesión ajena además devuelve el bono de todos sus apuntados (E2-01)"
    ).toBe(1);
  });

  test("DELETE con ?confirmSettled=1 tampoco abre la puerta", async ({ request }) => {
    // La confirmación de RB-AGENDA-010 es para las sesiones con asistencias ya
    // registradas; no es una llave que se salte el ámbito.
    const res = await request.delete(
      `${API_PREFIX}/agenda/sessions/${fixture.santanderSessionId}?confirmSettled=1`,
      { headers: bearer(trainer) }
    );

    expect(res.status()).toBe(404);
    expect(await prisma.classSession.count({ where: { id: fixture.santanderSessionId } })).toBe(1);
  });

  test("sin token, las tres escrituras responden 401", async ({ request }) => {
    const post = await request.post(`${API_PREFIX}/agenda/sessions`, {
      data: sessionBody({ centerId: fixture.santanderCenterId, trainerId: fixture.santanderTrainerId }),
    });
    const patch = await request.patch(`${API_PREFIX}/agenda/sessions/${fixture.santanderSessionId}`, {
      data: sessionBody({ centerId: fixture.santanderCenterId, trainerId: fixture.santanderTrainerId }),
    });
    const del = await request.delete(`${API_PREFIX}/agenda/sessions/${fixture.santanderSessionId}`);

    expect([post.status(), patch.status(), del.status()]).toEqual([401, 401, 401]);
  });
});

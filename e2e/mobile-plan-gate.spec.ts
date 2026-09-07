import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { mobileLogin, bearer, jsonOf, API_PREFIX } from "./fixtures/mobile-api";
import { createEsencialOrg, deleteEsencialOrg, ESENCIAL_PASSWORD, type EsencialOrg } from "./fixtures/esencial-org";

/**
 * E7-06 · E5 (lado móvil) — con plan Esencial el endpoint de brief responde
 * **402**, no 200 ni 403.
 *
 * El código importa: 403 sería "tú no puedes" y 402 es "tu organización no lo
 * ha contratado". La app necesita distinguirlo para ofrecer el cambio de plan
 * en vez de un error de permisos o una pantalla en blanco.
 *
 * Verificado en su día contra la organización demo en `esencial_mes`:
 * `GET /trainer/brief` devolvía 200 con la lista completa y
 * `GET /trainer/members?filter=alerts` devolvía `{"light":"RED","zone":"rodilla
 * derecha"}`. En web las dos redirigían a `/planes`. Semáforo, zona de lesión y
 * Session Brief eran gratis desde la app: fuga de ingresos directa.
 *
 * Lo que este spec fija, además del 402, es la HERENCIA a las rutas hijas: es
 * lo que hace que añadir mañana `/trainer/brief/[id]/loquesea` no vuelva a
 * abrir el agujero. El camino positivo va aparte —lo cubre el resto de specs
 * contra la organización de demo, que está en Élite—, así que aquí solo vive el
 * negativo, que es el que faltaba.
 */

let esencial: EsencialOrg;

test.beforeAll(async () => {
  esencial = await createEsencialOrg();
});

test.afterAll(async () => {
  await deleteEsencialOrg();
  await prisma.$disconnect();
});

/** Rutas gateadas por `salud_aptitud`, padre e hijas. */
function gatedRoutes(sessionId: string, memberId: string) {
  return [
    { path: "/trainer/brief", feature: "salud_aptitud" },
    { path: `/trainer/brief/${sessionId}`, feature: "salud_aptitud" },
    { path: "/trainer/members", feature: "salud_aptitud" },
    { path: "/trainer/members?filter=alerts", feature: "salud_aptitud" },
    { path: `/trainer/members/${memberId}`, feature: "salud_aptitud" },
  ];
}

test.describe("E7-06 · E5 — el muro de pago de la API móvil", () => {
  test("la organización del fixture está de verdad en Esencial", async () => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: esencial.orgId },
      select: { platformPlan: true, platformStatus: true },
    });
    // Si esto se moviera, los 402 de abajo dejarían de probar el gateo.
    expect(org.platformPlan).toBe("esencial_mes");
    expect(org.platformStatus).toBe("ACTIVE");
  });

  test("brief, sus rutas hijas y el listado del entrenador responden 402", async ({ request }) => {
    const director = await mobileLogin(request, esencial.directorEmail, ESENCIAL_PASSWORD);

    for (const { path, feature } of gatedRoutes(esencial.sessionId, esencial.memberId)) {
      const res = await request.get(`${API_PREFIX}${path}`, { headers: bearer(director) });
      expect(res.status(), `${path} tiene que cerrarse con 402`).toBe(402);

      const body = (await res.json()) as { ok: boolean; error?: string; feature?: string };
      expect(body.ok).toBe(false);
      // La app pinta "tu plan no incluye esto" y ofrece el cambio: para eso
      // necesita saber QUÉ funcionalidad le falta.
      expect(body.feature, `${path} tiene que decir qué falta`).toBe(feature);
    }
  });

  test("402 y no 403: no es un problema de permisos de esta persona", async ({ request }) => {
    const director = await mobileLogin(request, esencial.directorEmail, ESENCIAL_PASSWORD);
    const res = await request.get(`${API_PREFIX}/trainer/brief`, { headers: bearer(director) });

    expect(res.status()).not.toBe(403);
    expect(res.status()).not.toBe(200);
    expect(res.status()).toBe(402);
  });

  test("la generación de mesociclos (ia_programacion) también se cierra", async ({ request }) => {
    const director = await mobileLogin(request, esencial.directorEmail, ESENCIAL_PASSWORD);
    const res = await request.post(`${API_PREFIX}/trainer/members/${esencial.memberId}/mesocycles`, {
      headers: bearer(director),
      data: { weeks: 4 },
    });

    expect(res.status()).toBe(402);
    const body = (await res.json()) as { feature?: string };
    expect(body.feature).toBe("ia_programacion");
    // Y no se ha generado nada: el gate va ANTES de llamar al proveedor de IA.
    expect(await prisma.mesocycle.count({ where: { memberId: esencial.memberId } })).toBe(0);
  });

  test("lo que no es premium sigue abierto: la agenda del día no se gatea", async ({ request }) => {
    const director = await mobileLogin(request, esencial.directorEmail, ESENCIAL_PASSWORD);

    // El día a día de un centro Esencial tiene que funcionar entero, o el muro
    // de pago deja de ser un muro y pasa a ser una puerta cerrada.
    for (const path of ["/me", "/agenda", "/staff", "/tasks", "/notifications"]) {
      const res = await request.get(`${API_PREFIX}${path}`, { headers: bearer(director) });
      expect(res.status(), `${path} no está gateada y tiene que responder`).toBe(200);
    }
  });

  test("primero autentica y luego cobra: sin token es 401, no 402", async ({ request }) => {
    const res = await request.get(`${API_PREFIX}/trainer/brief`);
    expect(res.status(), "un 402 sin token le contaría a cualquiera qué plan tiene esta organización").toBe(401);
  });

  test("con plan Élite las mismas rutas abren: el 402 es el plan, no la ruta", async ({ request }) => {
    const jsonBody = await jsonOf<{ sessions: unknown[] }>(
      await request.get(`${API_PREFIX}/trainer/brief`, {
        headers: bearer(await mobileLogin(request, "direccion.lajota@trainingzone.es")),
      })
    );
    expect(jsonBody.ok).toBe(true);
  });
});

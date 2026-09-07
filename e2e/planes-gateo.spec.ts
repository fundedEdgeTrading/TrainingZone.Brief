import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs } from "./helpers";
import { mobileLogin, bearer, API_PREFIX } from "./fixtures/mobile-api";
import { createEsencialOrg, deleteEsencialOrg, ESENCIAL_PASSWORD, type EsencialOrg } from "./fixtures/esencial-org";

test.describe("F2 — Catálogo comercial y gateo por plan", () => {
  test("/planes es pública y explica el catálogo sin precios configurados", async ({ page }) => {
    await page.goto("/planes");

    await expect(page.getByRole("heading", { name: "Elige tu plan" })).toBeVisible();
    // La tabla comparativa se deriva del catálogo, así que existe con o sin precios.
    await expect(page.getByRole("heading", { name: "Qué incluye cada plan" })).toBeVisible();
    // RB-VENTA-005/006: se dice explícitamente que no hay comisión ni facturación.
    await expect(page.getByText(/Apta no cobra comisión sobre tus ingresos/)).toBeVisible();
  });

  /**
   * La intención original ("ningún botón muerto") sigue viva, pero cambió cómo
   * se cumple: sin STRIPE_SECRET_KEY se activa el modo demo
   * (lib/platform-plans.ts::isDemoModeActive), así que `listPurchasablePlans`
   * devuelve el catálogo ENTERO en vez de ninguno y "Contratar" lleva a
   * /demo-checkout en lugar de a un checkout de Stripe imposible. El aviso
   * "Todavía no hay precios configurados" sigue en app/planes/page.tsx, pero
   * ahora solo es alcanzable con Stripe activo y sin STRIPE_PRICE_* — una mala
   * configuración de producción, no este entorno.
   */
  test("sin Stripe configurado el catálogo se ve en modo demo y ningún botón está muerto", async ({ page }) => {
    await page.goto("/planes");

    const contratar = page.getByRole("button", { name: /^Contratar/ });
    await expect(contratar.first()).toBeVisible();

    await contratar.first().click();
    await expect(page).toHaveURL(/\/demo-checkout\?plan=/);
    await expect(page.getByText(/Stripe no está configurado en este entorno/)).toBeVisible();
  });

  test("con plan Élite, dirección ve los módulos premium en el menú", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");

    const sidebar = page.locator("aside, nav").first();
    await expect(sidebar.getByRole("link", { name: "Feedback" })).toBeVisible();
    // Auditoría cuelga de "Administración", que arranca plegada (rediseño del
    // NavBar): se despliega antes de mirar. Lo que verifica el test es que el
    // plan Élite deja el módulo EN el menú, no dónde estaba el scroll.
    await sidebar.getByRole("button", { name: "Administración" }).click();
    await expect(sidebar.getByRole("link", { name: "Auditoría" })).toBeVisible();
  });

  test("una ruta gateada responde por URL directa cuando el plan la incluye", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    // `/feedback` en vez de `/retention`: aquella ruta se retiró junto con su
    // pantalla y el gateo de `retencion` pasó al motor (`src/lib/retention.ts`),
    // que no tiene URL que probar.
    await page.goto("/feedback");

    // Con Élite no debe desviar a /planes.
    await expect(page).toHaveURL(/\/feedback/);
  });
});

/**
 * E7-08 · el CAMINO NEGATIVO del muro de pago.
 *
 * Hasta aquí este fichero solo probaba el positivo —con plan Élite todo se ve—,
 * y por eso pasaron los dos fallos de gateo: un test verde sobre un agujero
 * abierto. Lo que faltaba es lo contrario: que con un plan que NO incluye la
 * funcionalidad, la puerta esté cerrada.
 *
 * Las rutas hijas van una a una y no por muestreo, porque ahí estuvo
 * exactamente el agujero (E6-02): el mapa declaraba `/brief` y `/feedback`, la
 * guarda vivía en esas dos páginas, y `/brief/<sessionId>` —el enlace que pinta
 * la propia agenda— respondía 200 con el semáforo completo mientras `/brief`
 * redirigía. Heredar por prefijo es lo que hace que una hija nueva no vuelva a
 * abrirlo, y esto es lo que lo comprueba.
 *
 * Se prueba contra una organización Esencial propia, no bajando de plan a la de
 * demo: el plan es estado global de la organización y media suite depende de
 * que la de demo siga en Élite.
 */
test.describe("E7-08 — el muro de pago cierra: camino negativo", () => {
  let esencial: EsencialOrg;

  test.beforeAll(async () => {
    esencial = await createEsencialOrg();
  });

  test.afterAll(async () => {
    await deleteEsencialOrg();
    await prisma.$disconnect();
  });

  test("cada ruta premium redirige a /planes con el parámetro de feature", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, esencial.directorEmail, ESENCIAL_PASSWORD);

    const rutas = [
      { path: "/brief", feature: "salud_aptitud" },
      { path: "/feedback", feature: "feedback_direccion" },
      { path: "/health/aptitude-rules", feature: "salud_aptitud" },
      { path: "/health/reference-ranges", feature: "salud_aptitud" },
    ];

    for (const { path, feature } of rutas) {
      await page.goto(path);
      // El parámetro no es decoración: es lo que hace que /planes pueda decir
      // qué le falta a esta organización en vez de enseñarle el catálogo entero.
      await expect(page, `${path} tiene que cerrarse`).toHaveURL(new RegExp(`/planes\\?feature=${feature}`));
    }
  });

  test("las rutas hijas también redirigen, que es donde estaba el agujero", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, esencial.directorEmail, ESENCIAL_PASSWORD);

    const hijas = [
      { path: `/brief/${esencial.sessionId}`, feature: "salud_aptitud" },
      { path: `/feedback/${esencial.memberId}`, feature: "feedback_direccion" },
      { path: "/feedback/debriefs-semanales", feature: "feedback_direccion" },
    ];

    for (const { path, feature } of hijas) {
      await page.goto(path);
      await expect(page, `${path} respondía 200 mientras su padre redirigía`).toHaveURL(
        new RegExp(`/planes\\?feature=${feature}`)
      );
      // Y no se ha llegado a pintar nada de dentro: sin esto, un redirect
      // tardío podría dejar el contenido en el HTML de la respuesta.
      await expect(page.getByRole("heading", { name: "Elige tu plan" })).toBeVisible();
    }
  });

  test("el endpoint móvil equivalente responde 402", async ({ request }) => {
    const director = await mobileLogin(request, esencial.directorEmail, ESENCIAL_PASSWORD);

    for (const path of ["/trainer/brief", `/trainer/brief/${esencial.sessionId}`, "/trainer/members"]) {
      const res = await request.get(`${API_PREFIX}${path}`, { headers: bearer(director) });
      expect(res.status(), `${path} en la app`).toBe(402);
    }
  });

  test("ia_programacion: la generación se rechaza y no se registra consumo", async ({ request }) => {
    const director = await mobileLogin(request, esencial.directorEmail, ESENCIAL_PASSWORD);
    const before = await prisma.mesocycle.count({ where: { member: { orgId: esencial.orgId } } });

    const res = await request.post(`${API_PREFIX}/trainer/members/${esencial.memberId}/mesocycles`, {
      headers: bearer(director),
      data: { weeks: 4, profile: "Fuerza", level: "intermedio", availability: "lunes" },
    });
    expect(res.status()).toBe(402);
    expect((await res.json()).feature).toBe("ia_programacion");

    // La IA es el único módulo con coste marginal real (~0,18 $ por generación,
    // facturados a Apta): un rechazo que igualmente hubiera llamado al modelo
    // sería una factura sin venta detrás.
    expect(await prisma.mesocycle.count({ where: { member: { orgId: esencial.orgId } } })).toBe(before);
    expect(
      await prisma.auditLog.count({ where: { orgId: esencial.orgId, action: { contains: "MESOCYCLE" } } })
    ).toBe(0);
  });

  test("lo que NO se gatea sigue abierto con plan Esencial", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, esencial.directorEmail, ESENCIAL_PASSWORD);

    // RB-PLAN-003 y D-C7: el registro y la consulta de lo que el gimnasio ya
    // guardó nunca se gatean —`/audit` incluido, que es obligación del art. 32
    // RGPD—, y `/dashboard` es la ruta de aterrizaje de dirección: cerrarla
    // dejaría a un cliente Esencial mirando un muro de pago en cada login.
    for (const path of ["/dashboard", "/agenda", "/members", "/audit"]) {
      await page.goto(path);
      await expect(page, `${path} no se gatea`).not.toHaveURL(/\/planes/);
    }
  });
});

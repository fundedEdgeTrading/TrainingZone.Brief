import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs, isoDay } from "./helpers";
import { createBookingMember, deleteBookingMembers, type Fixture } from "./fixtures/booking-members";

const toast = (page: import("@playwright/test").Page) => page.locator("[role=status], [role=alert]");

/** En la agenda, un clic en la tarjeta abre el diálogo de edición de esa sesión. */
async function openSessionInAgenda(page: import("@playwright/test").Page, title: string, date: string) {
  await page.goto(`/agenda?week=${date}`);
  await page.locator(`[title="${title}"]`).first().click();
  await expect(page.getByText("Editar sesión")).toBeVisible({ timeout: 15_000 });
}

test.describe("F11 — Agenda EP", () => {
  /**
   * RB-AGENDA-002: el diálogo de la agenda tiene que poder marcar la franja de
   * EP como autorreservable. Sin ese control, `saveSession` la creaba siempre
   * con `selfBookable = false` y el socio no la veía nunca en su portal.
   *
   * (Antes esto se probaba contra el botón "+ Franja EP", que desapareció con el
   * rediseño de la agenda estilo Google Calendar.)
   */
  test("entrenador crea una franja de EP y queda autorreservable por defecto", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/agenda");

    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    await expect(page.getByPlaceholder("Añadir título")).toBeVisible();

    const title = `Franja EP ${Date.now()}`;
    await page.getByRole("button", { name: "Entrenamiento personal", exact: true }).click();
    await page.getByPlaceholder("Añadir título").fill(title);
    await page.locator('input[type="date"]').first().fill(isoDay(1));
    await page.locator('input[type="time"]').nth(0).fill("11:00");
    await page.locator('input[type="time"]').nth(1).fill("12:00");
    await expect(page.getByLabel("Reservable por el socio desde su portal")).toBeChecked();

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText("Sesión creada")).toBeVisible({ timeout: 15_000 });

    // Y al reabrirla, el diálogo conserva la marca.
    await openSessionInAgenda(page, title, isoDay(1));
    await expect(page.getByLabel("Reservable por el socio desde su portal")).toBeChecked();
  });

  test("el grupo reducido se crea con las plazas que elige el entrenador", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/agenda");

    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    await expect(page.getByPlaceholder("Añadir título")).toBeVisible();
    await page.getByRole("button", { name: "Grupo reducido", exact: true }).click();

    const title = `Grupo aforo ${Date.now()}`;
    await page.getByPlaceholder("Añadir título").fill(title);
    await page.locator('input[type="date"]').first().fill(isoDay(1));
    await page.locator('input[type="time"]').nth(0).fill("13:00");
    await page.locator('input[type="time"]').nth(1).fill("14:00");
    await page.getByLabel("Plazas del grupo").fill("8");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText("Sesión creada")).toBeVisible({ timeout: 15_000 });

    // Reabrir la sesión conserva el aforo elegido (antes estaba fijado a 6 sin
    // forma de cambiarlo desde la agenda).
    await openSessionInAgenda(page, title, isoDay(1));
    await expect(page.getByLabel("Plazas del grupo")).toHaveValue("8");
  });

  test("director de sesión y autorreserva en el detalle de una sesión de EP", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/agenda");

    // Al detalle de sesión se llega desde el diálogo → brief → "volver".
    const epCard = page.locator('[title^="Personal Training"]').first();
    if (!(await epCard.isVisible().catch(() => false))) test.skip();

    await epCard.click();
    await page.getByRole("link", { name: /Ver debrief de la sesión/ }).click();
    await page.waitForURL(/\/brief\//, { timeout: 15_000 });
    await page.getByRole("link", { name: /Volver al detalle de sesión/ }).click();
    await page.waitForURL(/\/agenda\/session\//, { timeout: 15_000 });

    await expect(page.getByText(/Dirigida por/)).toBeVisible();
    await expect(page.getByText(/Autorreservable por el cliente/)).toBeVisible();
  });

  /**
   * La línea de "ahora" cruza la columna del día entera a la hora actual y se
   * pinta por encima de las tarjetas. Si además recibe eventos de puntero, se
   * come el clic de la sesión que le toque debajo — y cuál es esa sesión
   * depende de la hora a la que se ejecute la suite, así que el fallo aparecía
   * y desaparecía solo. Se comprueba la propiedad, no el síntoma: el síntoma no
   * es reproducible a voluntad.
   */
  test("la línea de la hora actual no se come el clic de la sesión que tiene debajo", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/agenda");

    const nowLine = page.locator("div.z-\\[4\\]").first();
    // Solo se pinta si hoy está a la vista y la hora cae dentro de la rejilla
    // (06:00-22:00). Fuera de esa ventana no hay nada que comprobar.
    if (!(await nowLine.isVisible().catch(() => false))) test.skip();

    await expect(nowLine).toHaveCSS("pointer-events", "none");
  });
});

/**
 * QA-RES-01: el campo "Socio asignado" del diálogo creaba la reserva a pelo —sin
 * descontar el bono ni mirar el aforo—. Ahora pasa por el motor de reservas del
 * staff: descuenta, deja asiento, y un segundo socio no cabe en un EP de una
 * plaza. Lo que se comprueba aquí es el camino de la pantalla; la regla la
 * cubre `src/lib/agenda-queries.test.ts`.
 */
test.describe("QA-RES-01 — Socio asignado a un EP", () => {
  let a: Fixture;
  let b: Fixture;
  const title = `EP asignado ${Date.now()}`;

  test.beforeAll(async () => {
    a = await createBookingMember({ tag: `epasig-a-${Date.now()}`, service: "EP" });
    b = await createBookingMember({ tag: `epasig-b-${Date.now()}`, service: "EP" });
  });

  test.afterAll(async () => {
    await deleteBookingMembers([a, b]);
    await prisma.classSession.deleteMany({ where: { name: title } });
  });

  const balance = async (f: Fixture) =>
    (await prisma.subscription.findFirstOrThrow({ where: { memberId: f.memberId, status: "ACTIVE" } })).sessionsRemaining;

  async function pickMember(page: import("@playwright/test").Page, f: Fixture) {
    await page.locator('[data-field="member"] button[aria-haspopup="listbox"]').click();
    await page.getByPlaceholder("Buscar...").fill(f.fullName);
    await page.getByRole("button", { name: f.fullName, exact: false }).first().click();
  }

  test("asignar socio descuenta su bono y un segundo socio no cabe en la misma franja", async ({ page }) => {
    const beforeA = await balance(a);
    const beforeB = await balance(b);

    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/agenda");
    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    await page.getByRole("button", { name: "Entrenamiento personal", exact: true }).click();
    await pickMember(page, a);
    // Elegir socio reescribe el título con su nombre: el nuestro va después.
    await page.getByPlaceholder("Añadir título").fill(title);
    await page.locator('input[type="date"]').first().fill(isoDay(3));
    await page.locator('input[type="time"]').nth(0).fill("07:00");
    await page.locator('input[type="time"]').nth(1).fill("08:00");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText("Sesión creada")).toBeVisible({ timeout: 15_000 });

    const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: a.memberId, session: { name: title } } });
    expect(booking.status).toBe("BOOKED");
    expect(booking.subscriptionId).not.toBeNull();
    expect(await balance(a)).toBe((beforeA ?? 0) - 1);
    const entry = await prisma.sessionLedger.findFirstOrThrow({ where: { bookingId: booking.id } });
    expect(entry.delta).toBe(-1);

    // La misma franja, con otro socio: el EP es de una plaza.
    await openSessionInAgenda(page, title, isoDay(3));
    await pickMember(page, b);
    await page.getByPlaceholder("Añadir título").fill(title);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText(/completa/)).toBeVisible({ timeout: 15_000 });

    expect(await prisma.booking.count({ where: { session: { name: title }, status: "BOOKED" } })).toBe(1);
    expect(await balance(b)).toBe(beforeB);
  });
});

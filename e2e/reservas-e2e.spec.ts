import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers";
import { createBookingMember, deleteBookingMembers, type Fixture } from "./fixtures/booking-members";

/**
 * Flujo completo de reservas, de punta a punta y por la interfaz real:
 *
 *   1. El ENTRENADOR crea la sesión en su agenda (EP autorreservable y grupo
 *      reducido con varias plazas).
 *   2. El SOCIO —dado de alta como socio nuevo con su email de bienvenida y su
 *      onboarding— la ve en su portal y la reserva.
 *   3. El ENTRENADOR vuelve a entrar y comprueba en el detalle de sesión y en
 *      el Session Brief quién va a asistir A ESA SESIÓN.
 *
 * Es la regresión del fallo reportado: el socio reservaba y el entrenador se
 * encontraba el debrief vacío ("nadie ha reservado").
 */

const TRAINER_EMAIL = "entrenador@trainingzone.es";
const TRAINER_NAME = "Dani Herrero";

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const toast = (page: Page) => page.locator("[role=status], [role=alert]");

/** Crea una sesión desde el diálogo de la agenda, tal cual lo haría el entrenador. */
async function createSessionInAgenda(
  page: Page,
  opts: {
    title: string;
    type: "personal" | "reduced";
    date: string;
    start: string;
    end: string;
    capacity?: number;
    recurrence?: "WEEKLY" | "WEEKDAYS";
  }
) {
  await page.goto("/agenda");
  // El botón del lateral rotula "+ Nueva sesión"; en móvil es un FAB con el
  // mismo aria-label.
  await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
  await expect(page.getByPlaceholder("Añadir título")).toBeVisible({ timeout: 15_000 });

  // El tipo primero: cambiar a "Grupo reducido" reescribe el título por defecto.
  if (opts.type === "reduced") await page.getByRole("button", { name: "Grupo reducido", exact: true }).click();
  else await page.getByRole("button", { name: "Entrenamiento personal", exact: true }).click();
  await page.getByPlaceholder("Añadir título").fill(opts.title);

  await page.locator('input[type="date"]').first().fill(opts.date);
  const times = page.locator('input[type="time"]');
  await times.nth(0).fill(opts.start);
  await times.nth(1).fill(opts.end);

  if (opts.type === "reduced" && opts.capacity != null) {
    await page.getByLabel("Plazas del grupo").fill(String(opts.capacity));
  } else if (opts.type === "personal") {
    // RB-AGENDA-002: sin esto la franja nace cerrada y el socio no la ve nunca.
    await expect(page.getByLabel("Reservable por el socio desde su portal")).toBeChecked();
  }

  if (opts.recurrence) {
    await page.getByRole("combobox").selectOption(opts.recurrence);
  }

  await page.getByRole("button", { name: `Entrenador ${TRAINER_NAME}` }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(toast(page).getByText("Sesión creada")).toBeVisible({ timeout: 15_000 });
}

/** Reserva desde el portal la tarjeta de sesión cuyo título coincide. */
async function bookFromPortal(page: Page, title: string, startTime: string) {
  await page.goto("/portal/agenda");
  const card = page.getByRole("article", { name: `${title} · ${startTime}` });
  await expect(card).toBeVisible({ timeout: 15_000 });

  await card.getByRole("button", { name: "Reservar", exact: true }).click();
  await expect(toast(page).getByText("¡Reserva confirmada!")).toBeVisible({ timeout: 15_000 });
}

/** Abre la sesión en la agenda: en la rejilla, un clic en la tarjeta abre el diálogo. */
async function openSessionInAgenda(page: Page, title: string, date: string) {
  await page.goto(`/agenda?week=${date}`);
  await page.locator(`[title="${title}"]`).first().click();
  await expect(page.getByText("Editar sesión")).toBeVisible({ timeout: 15_000 });
}

/** Desde la agenda, entra al Session Brief del día de esa sesión. */
async function openBrief(page: Page, title: string, date: string) {
  await openSessionInAgenda(page, title, date);
  await page.getByRole("link", { name: /Ver debrief de la sesión/ }).click();
  await page.waitForURL(/\/brief\//, { timeout: 15_000 });
}

/** Y desde el brief, al detalle de sesión (roster + check-in) del mismo día. */
async function openSessionDetail(page: Page, title: string, date: string) {
  await openBrief(page, title, date);
  await page.getByRole("link", { name: /Volver al detalle de sesión/ }).click();
  await page.waitForURL(/\/agenda\/session\//, { timeout: 15_000 });
}

test.describe("RB-RES — flujo completo de reservas (entrenador → socio → entrenador)", () => {
  const fixtures: Fixture[] = [];

  test.afterAll(async () => {
    await deleteBookingMembers(fixtures);
  });

  test("EP: el entrenador crea la franja, el socio la reserva y el brief lo lista", async ({ page }) => {
    const stamp = Date.now();
    const title = `EP E2E ${stamp}`;
    const date = isoDay(2);

    // --- 1. Entrenador: crea la franja de EP en la agenda ---
    await loginAs(page, TRAINER_EMAIL);
    await createSessionInAgenda(page, { title, type: "personal", date, start: "07:15", end: "08:15" });

    // --- 2. Socio nuevo (alta + email de bienvenida + onboarding) reserva ---
    const socio = await createBookingMember({ tag: `ep${stamp}`, service: "EP" });
    fixtures.push(socio);

    await loginAs(page, socio.email);
    await bookFromPortal(page, title, "07:15");
    await expect(
      page.getByRole("region", { name: "Tus próximas reservas" }).getByText(title)
    ).toBeVisible();

    // --- 3. Entrenador: ¿quién va a asistir a ESA sesión? ---
    await loginAs(page, TRAINER_EMAIL);
    await openBrief(page, title, date);
    // Esta es la regresión: el brief decía "Sin reservas" con el socio reservado.
    await expect(page.getByText("Sin reservas")).toHaveCount(0);
    await expect(page.getByText(socio.fullName)).toBeVisible();

    await page.getByRole("link", { name: /Volver al detalle de sesión/ }).click();
    await page.waitForURL(/\/agenda\/session\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Roster \(1\)$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: socio.fullName })).toBeVisible();
  });

  test("Grupo reducido: varias reservas y todas aparecen en el brief", async ({ page }) => {
    const stamp = Date.now();
    const title = `Grupo E2E ${stamp}`;
    const date = isoDay(3);

    // --- 1. Entrenador: crea el grupo reducido con 4 plazas ---
    await loginAs(page, TRAINER_EMAIL);
    await createSessionInAgenda(page, { title, type: "reduced", date, start: "18:15", end: "19:15", capacity: 4 });

    // --- 2. Tres socios distintos reservan la misma sesión ---
    const socios: Fixture[] = [];
    for (const n of ["uno", "dos", "tres"]) {
      const m = await createBookingMember({ tag: `grp${n}${stamp}`, service: "GROUP" });
      fixtures.push(m);
      socios.push(m);
      await loginAs(page, m.email);
      await bookFromPortal(page, title, "18:15");
    }

    // --- 3. Entrenador: el brief y el roster listan a los tres ---
    await loginAs(page, TRAINER_EMAIL);
    await openBrief(page, title, date);
    await expect(page.getByText("Sin reservas")).toHaveCount(0);
    for (const m of socios) {
      await expect(page.getByText(m.fullName)).toBeVisible();
    }

    await page.getByRole("link", { name: /Volver al detalle de sesión/ }).click();
    await page.waitForURL(/\/agenda\/session\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Roster \(3\)$/ })).toBeVisible();
    await expect(page.getByText("3/4")).toBeVisible();
    for (const m of socios) {
      await expect(page.getByRole("link", { name: m.fullName })).toBeVisible();
    }
  });

  test("serie semanal: la reserva cuenta solo en el día reservado", async ({ page }) => {
    const stamp = Date.now();
    const title = `Semanal E2E ${stamp}`;
    // Serie arrancada hace 5 días: ocurre hoy-5 y hoy+2. Solo la segunda cae
    // dentro de la ventana de reserva de 7 días.
    const baseDate = isoDay(-5);
    const bookedDate = isoDay(2);

    await loginAs(page, TRAINER_EMAIL);
    await createSessionInAgenda(page, {
      title,
      type: "reduced",
      date: baseDate,
      start: "20:15",
      end: "21:15",
      capacity: 4,
      recurrence: "WEEKLY",
    });

    // Antes el portal filtraba `date` en BD sin proyectar la serie: la sesión
    // solo se podía reservar la semana de su fecha base.
    const socio = await createBookingMember({ tag: `sem${stamp}`, service: "GROUP" });
    fixtures.push(socio);
    await loginAs(page, socio.email);
    await bookFromPortal(page, title, "20:15");

    await loginAs(page, TRAINER_EMAIL);
    await openBrief(page, title, bookedDate);
    await expect(page.getByText(socio.fullName)).toBeVisible();

    // La misma serie, otra ocurrencia: no debe arrastrar el roster del otro día.
    await openBrief(page, title, baseDate);
    await expect(page.getByText("Sin reservas")).toBeVisible();
  });

  test("editar la sesión en la agenda no borra las reservas de los socios", async ({ page }) => {
    const stamp = Date.now();
    const title = `Grupo edit ${stamp}`;
    const date = isoDay(4);

    await loginAs(page, TRAINER_EMAIL);
    await createSessionInAgenda(page, { title, type: "reduced", date, start: "19:15", end: "20:15", capacity: 4 });

    const socio = await createBookingMember({ tag: `edit${stamp}`, service: "GROUP" });
    fixtures.push(socio);
    await loginAs(page, socio.email);
    await bookFromPortal(page, title, "19:15");

    // El entrenador reabre la sesión y la guarda cambiando la hora: antes esto
    // cancelaba en silencio todas las reservas y dejaba el brief vacío.
    await loginAs(page, TRAINER_EMAIL);
    await openSessionInAgenda(page, title, date);
    await page.locator('input[type="time"]').nth(0).fill("19:30");
    await page.locator('input[type="time"]').nth(1).fill("20:30");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText("Sesión actualizada")).toBeVisible({ timeout: 15_000 });

    await openSessionDetail(page, title, date);
    await expect(page.getByRole("heading", { name: /^Roster \(1\)$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: socio.fullName })).toBeVisible();
  });
});

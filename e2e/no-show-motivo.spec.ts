import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs, isoDay } from "./helpers";
import { createBookingMember, deleteBookingMembers, type Fixture } from "./fixtures/booking-members";

/**
 * RB-RES-009 de punta a punta: el socio reserva (y su bono baja), el entrenador
 * marca la falta eligiendo motivo y decide si le devuelve la sesión.
 *
 * Lo que se comprueba aquí y no puede comprobar un test de librería es que la
 * decisión llega de verdad desde la interfaz hasta el saldo: el bono sube solo
 * cuando el entrenador marca la casilla, la falta se registra igual cuando no
 * la marca, y el roster enseña después las dos cosas que se decidieron.
 */

const TRAINER_EMAIL = "entrenador@trainingzone.es";
const TRAINER_NAME = "Dani Herrero";

const toast = (page: Page) => page.locator("[role=status], [role=alert]");

async function createEpSlot(page: Page, title: string, date: string, start: string, end: string) {
  await page.goto("/agenda");
  await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
  await expect(page.getByPlaceholder("Añadir título")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Entrenamiento personal", exact: true }).click();
  await page.getByPlaceholder("Añadir título").fill(title);
  await page.locator('input[type="date"]').first().fill(date);
  const times = page.locator('input[type="time"]');
  await times.nth(0).fill(start);
  await times.nth(1).fill(end);
  await page.locator('[data-field="trainer"]').getByRole("button").first().click();
  await page.locator(".tz-select-pop").getByRole("button", { name: TRAINER_NAME, exact: true }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(toast(page).getByText("Sesión creada")).toBeVisible({ timeout: 15_000 });
}

async function bookFromPortal(page: Page, title: string, startTime: string) {
  await page.goto("/portal/agenda");
  const card = page.getByRole("article", { name: `${title} · ${startTime}` });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Reservar", exact: true }).click();
  await expect(toast(page).getByText("¡Reserva confirmada!")).toBeVisible({ timeout: 15_000 });
}

/** Entra al detalle de sesión (roster) desde la agenda del entrenador. */
async function openSessionDetail(page: Page, title: string, date: string) {
  await page.goto(`/agenda?week=${date}`);
  await page.locator(`[title="${title}"]`).first().click();
  await expect(page.getByText("Editar sesión")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /Ver debrief de la sesión/ }).click();
  await page.waitForURL(/\/brief\//, { timeout: 15_000 });
  await page.getByRole("link", { name: /Volver al detalle de sesión/ }).click();
  await page.waitForURL(/\/agenda\/session\//, { timeout: 15_000 });
}

async function remainingSessions(memberId: string) {
  const sub = await prisma.subscription.findFirstOrThrow({ where: { memberId, status: "ACTIVE" } });
  return sub.sessionsRemaining;
}

test.describe("RB-RES-009 — falta con motivo y devolución manual de la sesión", () => {
  const fixtures: Fixture[] = [];

  test.afterAll(async () => {
    await deleteBookingMembers(fixtures);
  });

  test("el entrenador marca la falta con motivo y devuelve la sesión al bono", async ({ page }) => {
    const stamp = Date.now();
    const title = `EP falta ${stamp}`;
    const date = isoDay(1);

    await loginAs(page, TRAINER_EMAIL);
    await createEpSlot(page, title, date, "07:15", "08:15");

    const socio = await createBookingMember({ tag: `falta${stamp}`, service: "EP" });
    fixtures.push(socio);
    await loginAs(page, socio.email);
    await bookFromPortal(page, title, "07:15");

    // La reserva ya descontó la sesión del bono (RB-RES-006): es el saldo
    // sobre el que decide el entrenador.
    const afterBooking = await remainingSessions(socio.memberId);

    await loginAs(page, TRAINER_EMAIL);
    await openSessionDetail(page, title, date);

    await page.getByRole("button", { name: `Marcar que ${socio.fullName} no asistió` }).click();
    // Todo dentro del diálogo: el detalle de una sesión de EP ya tiene su
    // propia casilla ("Autorreservable"), que si no se colaría en el locator.
    const dialog = page.getByRole("dialog", { name: `Marcar falta de ${socio.fullName}` });
    await expect(dialog).toBeVisible();
    // "Motivo" es el desplegable del sistema de diseño (botón + popover), no un
    // <select> nativo: se abre y se elige la opción, igual que en la agenda.
    await dialog.getByLabel("Motivo").click();
    await page.locator(".tz-select-pop").getByRole("button", { name: /Causa justificada/ }).click();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Marcar falta" }).click();
    await expect(toast(page).getByText(/sesión devuelta al bono/)).toBeVisible({ timeout: 15_000 });

    // El roster deja escrito lo que se decidió: por qué faltó y qué pasó con
    // la sesión.
    await expect(page.getByText("Causa justificada · sesión devuelta")).toBeVisible();
    expect(await remainingSessions(socio.memberId)).toBe((afterBooking ?? 0) + 1);
  });

  test("sin devolver, la falta se registra y el bono se queda como estaba", async ({ page }) => {
    const stamp = Date.now();
    const title = `EP falta sin devolver ${stamp}`;
    const date = isoDay(1);

    await loginAs(page, TRAINER_EMAIL);
    await createEpSlot(page, title, date, "07:20", "08:20");

    const socio = await createBookingMember({ tag: `plante${stamp}`, service: "EP" });
    fixtures.push(socio);
    await loginAs(page, socio.email);
    await bookFromPortal(page, title, "07:20");
    const afterBooking = await remainingSessions(socio.memberId);

    await loginAs(page, TRAINER_EMAIL);
    await openSessionDetail(page, title, date);

    await page.getByRole("button", { name: `Marcar que ${socio.fullName} no asistió` }).click();
    const dialog = page.getByRole("dialog", { name: `Marcar falta de ${socio.fullName}` });
    // La casilla de devolver arranca desmarcada a propósito: no devolver es el
    // comportamiento que tenía el sistema, y devolver es la decisión explícita.
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await dialog.getByLabel("Motivo").click();
    await page.locator(".tz-select-pop").getByRole("button", { name: /No avisó/ }).click();
    await dialog.getByRole("button", { name: "Marcar falta" }).click();
    await expect(toast(page).getByText(/sin devolver la sesión/)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("No avisó · sesión no devuelta")).toBeVisible();
    expect(await remainingSessions(socio.memberId)).toBe(afterBooking);
  });
});

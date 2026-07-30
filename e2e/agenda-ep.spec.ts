import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

const toast = (page: import("@playwright/test").Page) => page.locator("[role=status], [role=alert]");

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    await loginAs(page, "sergio@trainingzone.es");
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
});

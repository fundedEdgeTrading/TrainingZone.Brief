import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

const toast = (page: import("@playwright/test").Page) => page.locator("[role=status], [role=alert]");

test.describe("RB-RES — Reservas del socio", () => {
  /**
   * Regresión: el listado de "Reservar clase" solo enseña 7 días del centro del
   * socio, pero el tope de reservas activas (RB-RES-004) cuenta todas sus
   * reservas futuras. Se veía una reserva en pantalla y la app respondía "ya
   * tienes 3 activas". El panel "Tus próximas reservas" debe enseñar exactamente
   * las mismas que se cuentan.
   */
  test("lo que cuenta el tope de reservas es lo que el socio ve en pantalla", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    // Reservar hasta topar con el límite (o quedarse sin clases libres).
    for (let i = 0; i < 4; i++) {
      const bookable = page.getByRole("button", { name: "Reservar", exact: true }).first();
      if ((await bookable.count()) === 0) break;
      await bookable.click();
      const message = toast(page).first();
      await expect(message).toBeVisible({ timeout: 15_000 });
      const text = await message.innerText();
      await page.reload();
      if (/reservas activas/.test(text)) break;
    }

    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    await expect(panel).toBeVisible();

    const counter = await panel.getByText(/^\d+ de \d+ activas$/).innerText();
    const active = Number(counter.split(" ")[0]);
    // Una fila por reserva viva: el contador nunca puede ir por delante.
    await expect(panel.getByRole("button", { name: /Cancelar|Salir de lista/ })).toHaveCount(active);
  });

  test("el socio ve las sesiones gastadas y las disponibles de su bono", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    await expect(page.getByText("Sesiones disponibles en tu bono")).toBeVisible();
    await expect(page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/)).toBeVisible();
  });

  test("cancelar una reserva devuelve la sesión al bono", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    const usedLine = page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/);
    const usedBefore = Number((await usedLine.innerText()).split(" ")[0]);

    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    await panel.getByRole("button", { name: "Cancelar" }).first().click();
    await expect(toast(page).getByText(/Reserva cancelada/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    const usedAfter = Number((await usedLine.innerText()).split(" ")[0]);
    expect(usedAfter).toBe(usedBefore - 1);
  });
});

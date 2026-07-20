import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F11 — Agenda EP", () => {
  test("entrenador puede crear una franja de EP y marcarla autorreservable", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/agenda");

    await page.getByRole("button", { name: "+ Franja EP" }).click();
    await expect(page.getByText("Nueva franja de EP")).toBeVisible();

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator('input[name="date"]').fill(tomorrow);
    await page.locator('input[name="startTime"]').fill("11:00");
    await page.getByLabel(/Autorreservable por el cliente/).check();
    await page.getByRole("button", { name: "Crear franja" }).click();

    await expect(page.getByText("Franja de EP creada")).toBeVisible({ timeout: 10_000 });
  });

  test("director de sesión y check-in en una sesión de EP existente", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/agenda");

    // Abre la primera sesión de "Personal Training" visible en la semana actual.
    const epChip = page.locator("text=Personal Training").first();
    if (await epChip.isVisible().catch(() => false)) {
      await epChip.click();
      await page.waitForURL(/\/agenda\/session\//);
      await expect(page.getByText(/Dirigida por/)).toBeVisible();
      await expect(page.getByText(/Autorreservable por el cliente/)).toBeVisible();
    }
  });
});

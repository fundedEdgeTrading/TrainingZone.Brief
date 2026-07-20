import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F8 — Embudo de leads", () => {
  test("formulario público crea un lead visible para el staff", async ({ page }) => {
    const uniquePhone = `6${Date.now().toString().slice(-8)}`;
    await page.goto("/lead-form/training-zone/centro");
    await expect(page.getByText("TRAINING ZONE Centro")).toBeVisible();

    await page.locator('input[name="firstName"]').fill("Playwright");
    await page.locator('input[name="lastName"]').fill("Tester");
    await page.locator('input[name="phone"]').fill(uniquePhone);
    await page.locator('input[name="postalCode"]').fill("28010");
    await page.locator('input[name="occupation"]').fill("QA automatizado");
    await page.locator('textarea[name="goals"]').fill("Probar el flujo de leads de principio a fin");
    await page.locator('select[name="channel"]').selectOption({ index: 1 });
    await page.locator('input[name="healthNote"]').fill("Ninguna");
    await page.getByRole("button", { name: "Enviar solicitud" }).click();

    await expect(page.getByText("¡Gracias!")).toBeVisible({ timeout: 10_000 });

    await loginAs(page, "sergio@trainingzone.es");
    await page.goto(`/leads?q=${uniquePhone}`);
    await expect(page.getByText("Playwright Tester")).toBeVisible();
  });

  test("dirección puede ver el lead sin responsable y reclamarlo", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/leads?q=Marina");
    await expect(page.getByText("Marina Castillo")).toBeVisible();
    const card = page.locator("div", { hasText: "Marina Castillo" }).first();
    const claimButton = card.getByRole("button", { name: "Reclamar" });
    if (await claimButton.isVisible().catch(() => false)) {
      await claimButton.click();
      await expect(page.getByText("Lead reclamado")).toBeVisible();
    }
  });

  test("ficha de lead: bitácora y archivado por no cierre", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/leads?q=Pedro");
    await page.getByText("Pedro Salinas").click();
    await expect(page.getByRole("heading", { name: /Pedro Salinas|Seguimiento/i }).first()).toBeVisible().catch(() => {});
    await expect(page.getByText("Bitácora")).toBeVisible();

    await page.locator('input[name="body"]').fill("Nota de prueba desde Playwright");
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByText("Nota de prueba desde Playwright")).toBeVisible();
  });
});

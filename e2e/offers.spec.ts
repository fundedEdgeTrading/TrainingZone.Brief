import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F14 — Ofertas personalizadas", () => {
  test("un entrenador propone una oferta manual y dirección la aprueba", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/offers");
    await expect(page.getByText("Proponer oferta manual")).toBeVisible();

    const memberSelect = page.locator('select[name="memberId"]');
    const optionCount = await memberSelect.locator("option").count();
    test.skip(optionCount <= 1, "El entrenador no tiene clientes de EP asignados en este seed.");

    await memberSelect.selectOption({ index: 1 });
    await page.locator('input[name="description"]').fill("Oferta E2E: 20% de descuento el primer mes");
    await page.getByRole("button", { name: "Proponer" }).click();
    await expect(page.getByText("Oferta propuesta a dirección")).toBeVisible();

    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/offers");
    await expect(page.getByText("Oferta E2E: 20% de descuento el primer mes").first()).toBeVisible();
  });
});

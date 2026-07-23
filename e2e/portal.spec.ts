import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F16 — Portal del socio: IA, objetivos y chat", () => {
  test("el socio ve su plan (objetivos, rutina)", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/plan");

    await expect(page.getByRole("heading", { name: "Tus objetivos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu rutina para casa" })).toBeVisible();
  });

  test("el socio puede escribir en su chat con el centro", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/chat");

    const message = `Mensaje E2E ${Date.now()}`;
    await page.locator('input[name="body"]').fill(message);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
  });

  test("el entrenador asignado ve el chat y la rutina del socio en su ficha", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/members?q=Marta");
    await page.getByText("Marta García López").click();
    await page.getByRole("button", { name: "IA & Chat" }).click();
    await expect(page.getByText("Rutina de IA")).toBeVisible();
    await expect(page.getByText("Chat (RB-CHAT-001)")).toBeVisible();
  });
});

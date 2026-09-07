import { test, expect } from "@playwright/test";
import { dismissPortalGates, loginAs } from "./helpers";

test.describe("F16 — Portal del socio: IA, objetivos y chat", () => {
  test("el socio ve su plan (objetivos)", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await dismissPortalGates(page);
    // "Mi plan" se fusionó en "Mi membresía" (producto/facturación); los
    // objetivos viven ahora en "Mi evolución" (handoff NavBar premium 1b).
    // E12-01: la rutina de IA falsa del portal se apaga (decisión de negocio
    // cerrada) — ya no hay "Tu rutina para casa" que comprobar aquí.
    await page.goto("/portal/evolucion");

    await expect(page.getByRole("heading", { name: "Tus objetivos" })).toBeVisible();
  });

  test("el socio puede escribir en su chat con el centro", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal");
    await dismissPortalGates(page);

    // El chat dejó de tener ruta propia: es un panel flotante disponible en todo
    // el portal (`portal/floating-chat.tsx`).
    await page.getByRole("button", { name: "Abrir chat" }).click();

    const message = `Mensaje E2E ${Date.now()}`;
    await page.locator('input[name="body"]').fill(message);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
  });
});

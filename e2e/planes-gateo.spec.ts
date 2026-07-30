import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F2 — Catálogo comercial y gateo por plan", () => {
  test("/planes es pública y explica el catálogo sin precios configurados", async ({ page }) => {
    await page.goto("/planes");

    await expect(page.getByRole("heading", { name: "Elige tu plan" })).toBeVisible();
    // La tabla comparativa se deriva del catálogo, así que existe con o sin precios.
    await expect(page.getByRole("heading", { name: "Qué incluye cada plan" })).toBeVisible();
    // RB-VENTA-005/006: se dice explícitamente que no hay comisión ni facturación.
    await expect(page.getByText(/Apta no cobra comisión sobre tus ingresos/)).toBeVisible();
  });

  test("sin precios en el entorno no se muestran botones muertos", async ({ page }) => {
    await page.goto("/planes");
    await expect(page.getByText(/Todavía no hay precios configurados/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Contratar/ })).toHaveCount(0);
  });

  test("con plan Élite, dirección ve los módulos premium en el menú", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");

    const sidebar = page.locator("aside, nav").first();
    await expect(sidebar.getByRole("link", { name: "Retención" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Feedback" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Auditoría" })).toBeVisible();
  });

  test("una ruta gateada responde por URL directa cuando el plan la incluye", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/retention");

    // Con Élite no debe desviar a /planes.
    await expect(page).toHaveURL(/\/retention/);
  });
});

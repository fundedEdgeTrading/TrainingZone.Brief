import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F12 — Cobros por Stripe (fallback) y F17 — BI", () => {
  test("el cobro por Stripe muestra el aviso de configuración y el manual sigue disponible", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/billing");

    await expect(page.getByRole("heading", { name: "Cobro por Stripe" })).toBeVisible();
    await expect(page.getByText(/Stripe no está configurado en este entorno/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registrar cobro manual" })).toBeVisible();
  });

  test("el panel de dirección muestra las métricas de BI (LTV, demografía, mapa de CP)", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/dashboard");

    await expect(page.getByText("LTV medio por cliente")).toBeVisible();
    await expect(page.getByText("Ticket medio")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nicho principal (ocupación)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Objetivos (agregado)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Distribución geográfica/ })).toBeVisible();
  });
});

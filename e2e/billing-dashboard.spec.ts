import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F12 — Cobros por Stripe (fallback) y F17 — BI", () => {
  test("el cobro por Stripe muestra el aviso de configuración y el manual sigue disponible", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/billing");

    await expect(page.getByRole("heading", { name: "Cobro por Stripe" })).toBeVisible();
    // Degradación honesta (RB-CONNECT-002): sin cuenta conectada la UI explica
    // qué falta y deja el cobro manual como puente, en vez de fallar.
    await expect(page.getByText(/Conecta tu Stripe para cobrar/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registrar cobro manual" })).toBeVisible();
  });

  test("el panel de dirección muestra las métricas de BI (LTV, demografía, mapa de CP)", async ({ page }) => {
    // Dirección ya aterriza en /dashboard al iniciar sesión: un `goto` aquí
    // repetiría la navegación que acaba de ocurrir en vez de esperar a que
    // termine (RB-E2E: no navegar a la ruta en la que ya estás).
    await loginAs(page, "direccion@trainingzone.es");

    await expect(page.getByText("LTV medio por cliente")).toBeVisible();
    await expect(page.getByText("Ticket medio")).toBeVisible();
    // El rediseño del panel acortó los títulos: "Nicho principal (ocupación)" y
    // "Objetivos (agregado)" perdieron el paréntesis, que era jerga interna.
    await expect(page.getByRole("heading", { name: "Nicho principal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Objetivos" })).toBeVisible();
    // El panel por provincia se sustituyó por el mapa de calor por barrio (CP completo).
    await expect(page.getByText(/Mapa de calor/).first()).toBeVisible();
    // El insight y los selectores de la barra de contexto son la cabecera nueva.
    await expect(page.getByText("Ocupación media")).toBeVisible();
    await expect(page.getByRole("link", { name: "Todos", exact: true })).toBeVisible();
  });
});

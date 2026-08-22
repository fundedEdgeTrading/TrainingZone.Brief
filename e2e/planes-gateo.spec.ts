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

  /**
   * La intención original ("ningún botón muerto") sigue viva, pero cambió cómo
   * se cumple: sin STRIPE_SECRET_KEY se activa el modo demo
   * (lib/platform-plans.ts::isDemoModeActive), así que `listPurchasablePlans`
   * devuelve el catálogo ENTERO en vez de ninguno y "Contratar" lleva a
   * /demo-checkout en lugar de a un checkout de Stripe imposible. El aviso
   * "Todavía no hay precios configurados" sigue en app/planes/page.tsx, pero
   * ahora solo es alcanzable con Stripe activo y sin STRIPE_PRICE_* — una mala
   * configuración de producción, no este entorno.
   */
  test("sin Stripe configurado el catálogo se ve en modo demo y ningún botón está muerto", async ({ page }) => {
    await page.goto("/planes");

    const contratar = page.getByRole("button", { name: /^Contratar/ });
    await expect(contratar.first()).toBeVisible();

    await contratar.first().click();
    await expect(page).toHaveURL(/\/demo-checkout\?plan=/);
    await expect(page.getByText(/Stripe no está configurado en este entorno/)).toBeVisible();
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

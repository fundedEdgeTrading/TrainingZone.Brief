import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * HU-ST-27 · La pantalla de cupones: se llega desde Cobros, dirección de
 * organización puede dar de alta un código y dirección de centro ve la medición
 * de SUS centros pero no el formulario de alta —el cupón vive en la cuenta de
 * Stripe de la organización y no tiene centro—.
 */
test.describe("HU-ST-27 — Cupones y códigos promocionales", () => {
  test("dirección de organización entra desde Cobros y puede crear códigos", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/billing");

    await page.getByRole("link", { name: "Cupones", exact: true }).click();
    await expect(page).toHaveURL(/\/billing\/cupones$/);

    await expect(page.getByRole("heading", { name: "Crear un código" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rendimiento por código" })).toBeVisible();
    // La medición, que es lo que pide la historia.
    await expect(page.getByText("Ventas con código")).toBeVisible();
    await expect(page.getByText("Importe traído")).toBeVisible();

    // Sin cuenta de Stripe conectada (la demo no la tiene) el alta degrada con
    // un motivo explícito y el formulario queda inerte, en vez de aceptar un
    // código que nunca llegaría a existir en la pasarela (RB-CONNECT-002).
    await expect(page.getByText("Conecta tu cuenta de Stripe para poder crear códigos.")).toBeVisible();
    await expect(page.getByLabel("Código")).toBeDisabled();
    await expect(page.getByRole("button", { name: /Crear código/ })).toBeDisabled();
  });

  test("dirección de centro ve la medición pero no da de alta códigos", async ({ page }) => {
    await loginAs(page, "direccion.lajota@trainingzone.es");
    await page.goto("/billing/cupones");

    await expect(page.getByRole("heading", { name: "Rendimiento por código" })).toBeVisible();
    await expect(page.getByText(/lo da de alta la dirección de la organización/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear código" })).toHaveCount(0);
  });

  test("recepción no llega a la pantalla de cupones", async ({ page }) => {
    await loginAs(page, "recepcion.lajota@trainingzone.es");
    await page.goto("/billing/cupones");

    // `requireRole` redirige a la pantalla de aterrizaje del rol: un código
    // promocional es una decisión comercial, no de mostrador.
    await expect(page).not.toHaveURL(/\/billing\/cupones$/);
  });
});

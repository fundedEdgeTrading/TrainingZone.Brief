import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * La agenda se puede ampliar a toda la pantalla (tapa cabecera y menú lateral)
 * y se sigue trabajando con ella ahí dentro: crear, editar y arrastrar sesiones.
 * Se sale con Escape o con el botón de minimizar.
 */
test.describe("Agenda — pantalla completa", () => {
  const expandir = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "Ver a pantalla completa" });
  const minimizar = (page: import("@playwright/test").Page) =>
    page.getByRole("button", { name: "Salir de pantalla completa" });

  test("la agenda ampliada ocupa el viewport y se sale con Escape", async ({ page }) => {
    await loginAs(page, "director1.santander@trainingzone.es");
    await page.goto("/agenda");
    await page.locator("main").first().waitFor();

    await expandir(page).click();
    await expect(minimizar(page)).toBeVisible();

    // Toda la pantalla: la agenda sale de la tarjeta de la página, así que su
    // caja tiene que coincidir con el viewport (si se quedara atrapada dentro
    // de un ancestro con `transform`, mediría menos).
    const box = await page.evaluate(() => {
      const el = document.querySelector("div.fixed.inset-0.z-\\[70\\]");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const viewport = page.viewportSize()!;
    expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

    await page.keyboard.press("Escape");
    await expect(expandir(page)).toBeVisible();
  });

  test("ampliada se siguen creando sesiones y Escape cierra antes el diálogo", async ({ page }) => {
    await loginAs(page, "director1.santander@trainingzone.es");
    await page.goto("/agenda");
    await page.locator("main").first().waitFor();

    await expandir(page).click();
    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    await expect(page.getByPlaceholder("Añadir título")).toBeVisible();

    // Escape con el diálogo abierto no puede llevarse por delante la pantalla
    // completa: primero manda lo que esté encima de la rejilla.
    await page.keyboard.press("Escape");
    await expect(minimizar(page)).toBeVisible();
  });

  test("el modo ampliado sobrevive al salto de semana y el botón minimiza", async ({ page }) => {
    await loginAs(page, "director1.santander@trainingzone.es");
    await page.goto("/agenda");
    await page.locator("main").first().waitFor();

    await expandir(page).click();
    // Cada salto de semana remonta AgendaView, así que el modo viaja en la URL
    // (`full=1`) igual que la vista de semana en móvil.
    await page.getByRole("button", { name: "Semana siguiente" }).click();
    await expect(page).toHaveURL(/full=1/);
    await expect(minimizar(page)).toBeVisible();

    await minimizar(page).click();
    await expect(expandir(page)).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

// RB-LEAD-010 — Mapa de barrios. Lo que se comprueba es la lectura que pidió
// dirección: que la pantalla se abra desde el panel, que cada métrica cambie la
// pregunta y el orden del ranking (con Conversión al revés, porque ahí lo
// primero es el problema) y que la geometría llegue de verdad al DOM: un mapa
// que se pinta sin polígonos es exactamente el fallo que esta vista arregla.

test.describe("RB-LEAD-010 — Mapa de barrios", () => {
  test("dirección abre el mapa desde el panel y lee las seis métricas", async ({ page }) => {
    // Dirección aterriza en /dashboard al iniciar sesión.
    await loginAs(page, "sergio@trainingzone.es");

    await page.getByRole("link", { name: "Mapa de barrios" }).click();
    await page.waitForURL("**/mapa-barrios");

    // Coropleta: un polígono por barrio, no una mancha difuminada.
    const cells = page.locator(".tz-barrio-map .leaflet-overlay-pane path");
    await expect(cells.first()).toBeVisible({ timeout: 15_000 });
    expect(await cells.count()).toBeGreaterThan(5);

    // Cada métrica responde a una pregunta, y la leyenda se reetiqueta con ella.
    await expect(page.getByText("¿Dónde están mis clientes?")).toBeVisible();
    const ranking = page.getByText(/^Ranking · /);
    await expect(ranking).toHaveText("Ranking · Clientes");

    await page.getByRole("button", { name: "Conversión", exact: true }).click();
    await expect(page.getByText("¿Dónde convierto peor?")).toBeVisible();
    await expect(ranking).toHaveText("Ranking · Conversión");

    await page.getByRole("button", { name: "Oportunidad", exact: true }).click();
    await expect(page.getByText("¿Dónde abrir el próximo centro?")).toBeVisible();

    // El botón de nombres alterna, y la vuelta lleva al panel del que se salió.
    await page.getByRole("button", { name: "Ocultar nombres" }).click();
    await expect(page.getByRole("button", { name: "Ver nombres" })).toBeVisible();

    await page.getByRole("link", { name: "Volver" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("el ranking pone primero el peor barrio en Conversión y el mejor en Clientes", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/mapa-barrios");

    const rows = page.locator("button", { has: page.locator("span.tz-nums") });
    await expect(page.getByText("¿Dónde están mis clientes?")).toBeVisible();

    const valueOf = async (index: number) => {
      const text = await rows.nth(index).locator("span.tz-nums").first().innerText();
      return Number(text.replace("%", "").replace(" km", "").replace("+", ""));
    };

    const firstByMembers = await valueOf(0);
    const lastByMembers = await valueOf((await rows.count()) - 1);
    expect(firstByMembers).toBeGreaterThanOrEqual(lastByMembers);

    await page.getByRole("button", { name: "Conversión", exact: true }).click();
    await expect(page.getByText("¿Dónde convierto peor?")).toBeVisible();
    const firstByConv = await valueOf(0);
    const lastByConv = await valueOf((await rows.count()) - 1);
    expect(firstByConv).toBeLessThanOrEqual(lastByConv);
  });

  test("el selector de ciudad reencuadra sobre los barrios de la otra ciudad", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/mapa-barrios");

    await expect(page.getByText(/Zaragoza · \d+ centros?/)).toBeVisible();
    await page.getByRole("button", { name: "Santander", exact: true }).click();

    // El subtítulo del header lo pone la propia pantalla con su estado.
    await expect(page.getByText(/Santander · \d+ centros?/)).toBeVisible();
    // Y la geometría se reconstruye: los barrios de Santander son otros.
    await expect(page.getByRole("button", { name: /Puertochico/ })).toBeVisible();
  });
});

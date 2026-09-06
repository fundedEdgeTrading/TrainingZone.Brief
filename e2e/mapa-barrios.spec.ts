import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

// RB-LEAD-010 — Mapa de barrios. Lo que se comprueba es la lectura que pidió
// dirección: que la pantalla se abra desde el panel, que cada métrica cambie la
// pregunta y el orden del ranking (con Conversión al revés, porque ahí lo
// primero es el problema) y que la geometría llegue de verdad al DOM: un mapa
// que se pinta sin polígonos es exactamente el fallo que esta vista arregla.
//
// E11-04 — El ranking dejó de ser una lista de botones y pasó a ser una <table>
// accesible con las seis métricas a la vez, así que los selectores que leían
// `button > span.tz-nums` ahora leen celdas de la fila. La columna que manda es
// la de la métrica activa, que es la que ordena.

test.describe("RB-LEAD-010 — Mapa de barrios", () => {
  test("dirección abre el mapa desde el panel y lee las seis métricas", async ({ page }) => {
    // Dirección aterriza en /dashboard al iniciar sesión.
    await loginAs(page, "direccion@trainingzone.es");

    await page.getByRole("link", { name: "Mapa de barrios" }).click();
    await page.waitForURL("**/mapa-barrios");

    // Coropleta: un polígono por barrio, no una mancha difuminada. Se comprueba
    // por etapas para que, si algún día falla, el propio error diga dónde se
    // quedó: contenedor en el DOM → Leaflet montado → celdas dibujadas.
    await expect(page.locator(".tz-barrio-map")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".tz-barrio-map.leaflet-container")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => page.locator(".tz-barrio-map .leaflet-overlay-pane path").count(), { timeout: 15_000 })
      .toBeGreaterThan(5);

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
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios");

    // Las filas de la tabla del ranking, en el orden en que la vista las pinta.
    const rows = page.locator("table tbody tr");
    await expect(page.getByText("¿Dónde están mis clientes?")).toBeVisible();

    // La celda de la métrica activa es la que va en negrita: es la columna por
    // la que la tabla está ordenada.
    const valueOf = async (index: number) => {
      const text = await rows.nth(index).locator("td.font-extrabold").first().innerText();
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

  test("E11-04 — hay una vía no cartográfica al dato: tabla con las seis métricas", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios");

    // Una <table> de verdad, con su caption declarando fuente y aproximaciones.
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    await expect(table.locator("caption")).toContainText(/teselación|aproximad/i);

    // Las seis métricas a la vez, cosa que el mapa no puede hacer: solo pinta una.
    for (const label of ["Clientes", "Leads", "Conversión", "Tendencia", "Distancia", "Oportunidad"]) {
      await expect(table.locator("th[scope='col']", { hasText: label })).toHaveCount(1);
    }

    // La cabecera ordena Y cambia la métrica del mapa: son la misma acción.
    await table.getByRole("button", { name: "Ordenar por Oportunidad" }).click();
    await expect(page.getByText("¿Dónde abrir el próximo centro?")).toBeVisible();

    // El contenedor del mapa se anuncia como lo que es.
    await expect(page.locator(".tz-barrio-map")).toHaveAttribute("role", "application");
  });

  test("E11-08 — sin geometría publicada se pinta la teselación, y la nota lo dice", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios");

    // El recuento de polígonos es lo que esta historia podía romper: con
    // geometría real serían los mismos anillos por otra vía, y sin ella siguen
    // siendo los de `tessellate()`. En los dos casos, un polígono por barrio.
    await expect
      .poll(() => page.locator(".tz-barrio-map .leaflet-overlay-pane path").count(), { timeout: 15_000 })
      .toBeGreaterThan(5);

    // Y se declara cuál se está usando: decir "teselación" pintando barrios
    // reales sería tan falso como lo contrario. La nota sale en dos sitios —el
    // pie de la leyenda y el <caption> de la tabla—, así que se comprueban los
    // dos en vez de elegir uno.
    const nota = page.getByText(/teselación desde el centroide/);
    await expect(nota).toHaveCount(2);
    await expect(nota.first()).toBeVisible();
  });

  test("el selector de ciudad reencuadra sobre los barrios de la otra ciudad", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios");

    await expect(page.getByText(/Zaragoza · \d+ centros?/)).toBeVisible();
    await page.getByRole("button", { name: "Santander", exact: true }).click();

    // El subtítulo del header lo pone la propia pantalla con su estado.
    await expect(page.getByText(/Santander · \d+ centros?/)).toBeVisible();
    // Y la geometría se reconstruye: los barrios de Santander son otros.
    // Sigue siendo un botón (la celda de nombre lo es), ahora dentro de la tabla.
    await expect(page.getByRole("button", { name: /Puertochico/ })).toBeVisible();
    await expect
      .poll(() => page.locator(".tz-barrio-map .leaflet-overlay-pane path").count(), { timeout: 15_000 })
      .toBeGreaterThan(5);
  });
});

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

// ---------------------------------------------------------------------------
// E14-10 · La tabla de códigos postales pasa a vista de primera clase
// ---------------------------------------------------------------------------
//
// Negocio pidió «una tabla de CP con nº de clientes, nº de leads y conversión»
// teniendo esa tabla delante desde E11-04: estaba dentro del panel lateral del
// plano, rotulada como su vía accesible. Lo que se comprueba aquí es que ahora
// se encuentra, que la elección viaja en la URL como el resto del estado de la
// pantalla, y que se puede sacar a una hoja de cálculo.

test.describe("E14-10 — la tabla de CP como vista principal", () => {
  test("el conmutador de vista lleva a la tabla y la elección viaja en la URL", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios");

    const vista = page.getByRole("group", { name: "Vista" });
    await expect(vista).toBeVisible();

    await vista.getByRole("button", { name: "Tabla" }).click();
    // Cambiar de vista NO vuelve al servidor —las filas ya están en el cliente—,
    // así que la URL se reescribe con `history.replaceState` y no hay
    // navegación que esperar: se comprueba la URL, no un `waitForURL`.
    await expect.poll(() => new URL(page.url()).searchParams.get("vista")).toBe("tabla");

    // El plano se recoge: en la vista de tabla no se pinta ninguna geometría, y
    // por eso la nota deja de hablar de contornos.
    await expect(page.locator(".tz-barrio-map")).toHaveCount(0);
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    await expect(table.locator("caption")).not.toContainText(/teselación/);
    await expect(table.locator("caption")).toContainText(/mejor esfuerzo/);

    // Las tres métricas que pidió negocio, y las cuatro que ya estaban.
    for (const label of ["Clientes", "Leads", "Conversión", "Tendencia", "Distancia", "Oportunidad"]) {
      await expect(table.locator("th[scope='col']", { hasText: label })).toHaveCount(1);
    }

    // Y la vuelta: el mapa se reconstruye entero.
    await vista.getByRole("button", { name: "Mapa" }).click();
    // El mapa es el defecto y no se escribe: la URL se queda sin `vista`.
    await expect.poll(() => new URL(page.url()).searchParams.get("vista")).toBe(null);
    await expect
      .poll(() => page.locator(".tz-barrio-map .leaflet-overlay-pane path").count(), { timeout: 15_000 })
      .toBeGreaterThan(5);
  });

  test("la URL de la tabla se puede copiar y abre directamente en la tabla", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios?vista=tabla&metrica=conv");

    await expect(page.locator(".tz-barrio-map")).toHaveCount(0);
    await expect(page.locator("table").first()).toBeVisible();
    // La métrica activa llega con ella: la columna ordenada es la de conversión.
    await expect(page.locator("th[aria-sort='ascending']")).toHaveCount(1);
  });

  test("el periodo y el estado siguen mandando desde la vista de tabla", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios?vista=tabla");

    await page.getByRole("button", { name: "Trim.", exact: true }).click();
    // Cambiar de periodo sí vuelve al servidor: cambia el dato, no el color. Y
    // no se pierde la vista por el camino.
    await page.waitForURL(/range=trim/);
    expect(new URL(page.url()).searchParams.get("vista")).toBe("tabla");
    await expect(page.locator("table").first()).toBeVisible();
  });

  test("la tabla se exporta con el periodo y el filtro dentro del fichero", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/mapa-barrios?vista=tabla&range=trim");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^codigos-postales-[a-z-]+-\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");

    const [headers, first] = csv.replace(/^﻿/, "").split("\r\n");
    expect(headers.split(";")).toContain("Clientes");
    expect(headers.split(";")).toContain("Leads");
    expect(headers.split(";")).toContain("Conversión");
    // Sin periodo ni filtro dentro, el fichero no se puede volver a interpretar.
    expect(first).toContain("trimestre en curso");
    expect(first).toContain("Socios vivos");
  });
});

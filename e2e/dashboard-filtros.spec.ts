import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * Velo de marca al cambiar de centro o de periodo en el panel de control.
 *
 * Al cambiar solo los `searchParams` de la misma ruta no entra `loading.tsx`
 * —es un límite de segmento y el segmento no cambia— así que React deja el
 * panel viejo en pantalla hasta tener el nuevo entero: sin el velo, el clic
 * parece no hacer nada durante toda la recarga.
 *
 * La espera se fabrica retrasando la petición RSC en vez de confiar en que el
 * servidor vaya lento: el velo solo sale a partir de 400 ms, y en un runner con
 * la base al lado el panel se recarga bastante por debajo de eso.
 */
const RSC_DASHBOARD = /\/dashboard\?[^ ]*_rsc=/;

test.describe("Panel de control — filtros de centro y periodo", () => {
  test("el velo de marca cubre la recarga y la deja en la URL", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");

    await page.route(RSC_DASHBOARD, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    const veil = page.getByRole("alertdialog", { name: "Actualizando el panel" });
    await expect(veil).toBeHidden();

    await page.getByRole("link", { name: "La Jota", exact: true }).click();

    await expect(veil).toBeVisible({ timeout: 10_000 });
    // Los tramos son los del panel, no los del mesociclo: el mismo componente
    // con su propia descripción.
    await expect(veil.getByRole("status")).toHaveText(/Consultando|Recalculando|Rehaciendo|Pintando|Panel al día/);

    await expect(veil).toBeHidden({ timeout: 20_000 });
    // El filtro es la URL, no estado de cliente: sin esto el velo podría estar
    // tapando una navegación que no llegó a ocurrir.
    await expect(page).toHaveURL(/centerId=/);
  });

  test("una recarga rápida no enseña el velo", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");

    // Sin retardo: el panel se recarga muy por debajo del umbral de 400 ms, y
    // taparlo con un velo que aparece y se va sería peor que no poner nada.
    await page.getByRole("link", { name: "3 meses", exact: true }).click();
    await expect(page).toHaveURL(/range=3m/);
    await expect(page.getByRole("alertdialog", { name: "Actualizando el panel" })).toBeHidden();
  });

  /**
   * E14-06 · el periodo personalizado viaja en la URL igual que el resto, y se
   * valida en el servidor.
   *
   * Los dos escenarios que importan son el que funciona y el que NO: un rango
   * inválido llega escrito a mano, pegado de un chat o recortado por un cliente
   * de correo, y tiene que rechazarse **sin romper la pantalla**.
   */
  test("el periodo personalizado se elige, viaja en la URL y sobrevive a una recarga", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");

    await page.getByLabel("Desde").fill("2026-07-01");
    await page.getByLabel("Hasta").fill("2026-08-31");
    await page.getByRole("button", { name: "Ver periodo" }).click();

    await expect(page).toHaveURL(/range=custom&desde=2026-07-01&hasta=2026-08-31/);
    // El panel se pinta entero: el KPI de ingresos es lo primero que hay que ver.
    await expect(page.getByText("Ingresos del periodo", { exact: true })).toBeVisible();
    // Y el pie de la card de ingresos nombra el periodo elegido, no otro.
    await expect(page.getByText("del 1 jul al 31 ago")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Desde")).toHaveValue("2026-07-01");
  });

  test("un periodo inválido se rechaza sin romper la pantalla", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    // Rango invertido, escrito a mano en la URL.
    await page.goto("/dashboard?range=custom&desde=2026-08-31&hasta=2026-07-01");

    await expect(page.getByText("La fecha de inicio es posterior a la de fin.")).toBeVisible();
    // El panel sigue en pie con el periodo por defecto, no un 500 ni una página
    // en blanco.
    await expect(page.getByText("Ingresos del mes")).toBeVisible();
    await expect(page.getByRole("link", { name: "Mes", exact: true })).toBeVisible();
  });
});

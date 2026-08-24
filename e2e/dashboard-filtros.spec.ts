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
    await page.getByRole("link", { name: "Trim.", exact: true }).click();
    await expect(page).toHaveURL(/range=trim/);
    await expect(page.getByRole("alertdialog", { name: "Actualizando el panel" })).toBeHidden();
  });
});

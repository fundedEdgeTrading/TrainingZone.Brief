import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

/** El campo `name` también existe en la sección Marca: hay que acotar al formulario de producto. */
function newProductForm(page: Page) {
  return page.locator("form", { has: page.getByRole("button", { name: "Crear producto" }) });
}

/**
 * `Select` de este repo no es un <select> nativo: es un desplegable propio
 * (botón + input oculto), así que se abre con click y se elige por texto.
 */
async function chooseType(page: Page, label: string) {
  const form = newProductForm(page);
  await form.getByRole("button", { name: /Cuota mensual|Bono de sesiones|Sesión suelta/ }).click();
  // Las opciones son botones dentro del popover, no <option>.
  await page.locator(".tz-select-pop").getByRole("button", { name: label, exact: true }).click();
}

test.describe("F4 — Productos y puesta en marcha", () => {
  test("dirección puede crear un producto y archivarlo sin perder el histórico", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/organization");

    const name = `Bono E2E ${Date.now()}`;
    await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();

    const form = newProductForm(page);
    await form.locator('input[name="name"]').fill(name);
    await chooseType(page, "Bono de sesiones");
    await form.locator('input[name="priceEuros"]').fill("120,50");
    await form.locator('input[name="sessionsIncluded"]').fill("10");
    await form.getByRole("button", { name: "Crear producto" }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    // El precio se comprueba en la fila del producto recién creado, no en la
    // página: esta prueba archiva pero no borra, así que a la segunda vuelta
    // sobre la misma base de datos hay más de un producto a 120,50 € y una
    // búsqueda global rompía por ambigüedad en vez de por un fallo real.
    const row = page.locator("tr", { hasText: name });
    await expect(row.getByText("120,50 €")).toBeVisible();

    // Archivar lo saca de la lista activa pero lo mantiene disponible para reactivar.
    await row.getByRole("button", { name: "Archivar" }).click();
    await expect(page.getByRole("heading", { name: "Archivados" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Reactivar" }).first()).toBeVisible();
  });

  test("un bono sin sesiones incluidas se rechaza con un motivo claro", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/organization");

    const form = newProductForm(page);
    await form.locator('input[name="name"]').fill(`Bono sin sesiones ${Date.now()}`);
    await chooseType(page, "Bono de sesiones");
    await form.locator('input[name="priceEuros"]').fill("50");
    await form.getByRole("button", { name: "Crear producto" }).click();

    await expect(page.getByText(/necesita indicar cuántas sesiones incluye/)).toBeVisible({ timeout: 15_000 });
  });

  test("un precio de 0 o negativo se rechaza", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/organization");

    const form = newProductForm(page);
    await form.locator('input[name="name"]').fill(`Gratis ${Date.now()}`);
    await form.locator('input[name="priceEuros"]').fill("0");
    await form.getByRole("button", { name: "Crear producto" }).click();

    await expect(page.getByText(/El precio debe ser mayor que 0/)).toBeVisible({ timeout: 15_000 });
  });

  test("la puesta en marcha refleja el estado real de la organización", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/puesta-en-marcha");

    await expect(page.getByRole("heading", { name: /Pon en marcha tu centro|Todo listo/ })).toBeVisible();
    // Con el seed hay centros, equipo y socios: esos pasos salen completados.
    await expect(page.getByText("Tu primer centro")).toBeVisible();
    await expect(page.getByText(/de 7 completados/)).toBeVisible();
  });
});

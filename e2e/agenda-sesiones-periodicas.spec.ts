import { test, expect, type Page } from "@playwright/test";
import { loginAs, isoDay } from "./helpers";

const toast = (page: Page) => page.locator("[role=status], [role=alert]");
const scopeDialog = (page: Page) => page.getByRole("dialog", { name: "Editar sesión periódica" });

async function openSessionInAgenda(page: Page, title: string, date: string) {
  await page.goto(`/agenda?week=${date}`);
  await page.locator(`[title="${title}"]`).first().click();
  await expect(page.getByText("Editar sesión")).toBeVisible({ timeout: 15_000 });
}

test.describe("F11 — Agenda: sesiones periódicas", () => {
  /**
   * El tipo elegido escribe el prefijo del título ("EP …" / "Grupo …"), para
   * que la rejilla se lea de un vistazo sin que nadie tenga que teclearlo.
   */
  test("el tipo de entrenamiento pone el prefijo del título", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/agenda");

    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    const titleInput = page.getByPlaceholder("Añadir título");
    // Una sesión nueva nace como entrenamiento personal.
    await expect(titleInput).toHaveValue("EP ");

    await titleInput.fill("EP Espalda");
    await page.getByRole("button", { name: "Grupo reducido", exact: true }).click();
    // Cambiar de tipo sustituye el prefijo, no lo encadena.
    await expect(titleInput).toHaveValue("Grupo Espalda");

    await page.getByRole("button", { name: "Entrenamiento personal", exact: true }).click();
    await expect(titleInput).toHaveValue("EP Espalda");
  });

  /**
   * Una serie recurrente es UNA fila en la base de datos, así que guardar
   * cualquier cambio la reescribía entera: marcar "Prueba" en la sesión de la
   * semana que viene reetiquetaba también las que ya se habían dado. Ahora se
   * pregunta el alcance y "Esta sesión" saca solo ese día de la serie.
   */
  test("editar una ocurrencia con alcance 'Esta sesión' no toca las demás", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/agenda");

    const title = `Grupo semanal ${Date.now()}`;
    await page.getByRole("button", { name: /Nueva sesión/ }).first().click();
    await page.getByRole("button", { name: "Grupo reducido", exact: true }).click();
    await page.getByPlaceholder("Añadir título").fill(title);
    await page.locator('input[type="date"]').first().fill(isoDay(1));
    await page.locator('input[type="time"]').nth(0).fill("16:00");
    await page.locator('input[type="time"]').nth(1).fill("17:00");
    // "Se repite" es el desplegable del sistema de diseño, no un <select>
    // nativo: se abre por su rótulo actual y se elige la opción.
    await page.getByRole("button", { name: "No se repite" }).click();
    await page.locator(".tz-select-pop").getByRole("button", { name: "Cada semana", exact: true }).click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText("Sesión creada")).toBeVisible({ timeout: 15_000 });

    // La serie se proyecta también en la semana siguiente.
    await openSessionInAgenda(page, title, isoDay(8));
    await page.getByText("Prueba nuevo cliente").click();
    await page.getByRole("button", { name: "Guardar" }).click();

    // Guardar sobre una serie pregunta primero a qué sesiones se aplica.
    await expect(scopeDialog(page)).toBeVisible();
    await scopeDialog(page).getByText("Esta sesión", { exact: true }).click();
    await scopeDialog(page).getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page).getByText("Sesión actualizada")).toBeVisible({ timeout: 15_000 });

    // Ese día queda marcado como prueba…
    await page.goto(`/agenda?week=${isoDay(8)}`);
    await expect(page.locator(`[title="Prueba · ${title}"]`).first()).toBeVisible({ timeout: 15_000 });
    // …y la ocurrencia anterior sigue exactamente como estaba.
    await page.goto(`/agenda?week=${isoDay(1)}`);
    await expect(page.locator(`[title="${title}"]`).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`[title="Prueba · ${title}"]`)).toHaveCount(0);
  });
});

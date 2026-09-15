import { test, expect } from "@playwright/test";
import { dismissPortalGates, loginAs } from "./helpers";

/**
 * E5-15 · Borrado de cuenta desde el portal y su URL pública.
 *
 * Ninguno de estos tests llega a CREAR la solicitud, y es a propósito: la base
 * de demo es compartida y una solicitud abierta cambia lo que la pantalla
 * enseña, así que la suite dejaría de poder repetirse. Lo que se comprueba es
 * todo lo anterior a la fila —que la ruta existe, que el texto dice la verdad y
 * que sin la contraseña correcta no pasa nada—, que es justo donde estaban los
 * fallos que la historia señala. El alta y la resolución se prueban contra la
 * base en `src/lib/account-deletion.test.ts`.
 */

test.describe("E5-15 — URL web pública", () => {
  test("se abre sin sesión, como exige la ficha de tienda", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/borrar-cuenta");

    await expect(page).toHaveURL(/\/borrar-cuenta$/);
    await expect(page.getByRole("heading", { name: "Borrar tu cuenta", level: 1 })).toBeVisible();
  });

  test("explica el plazo y que los cobros se disocian", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/borrar-cuenta");

    await expect(page.getByText("art. 12.3 RGPD")).toBeVisible();
    await expect(page.getByText(/se disocian, no se borran/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Qué NO se borra, y por qué" })).toBeVisible();
  });
});

test.describe("E5-15 — Solicitud desde el portal del socio", () => {
  test("se llega desde Perfil y el plan se lee bloque a bloque", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/perfil");
    await dismissPortalGates(page);

    await page.getByRole("link", { name: /Pedir el borrado de mi cuenta|Ver el estado de mi solicitud/ }).click();
    await page.waitForURL("**/portal/perfil/borrar-cuenta");

    // Escenario 4: el bloque de cobros dice que se conservan sin su nombre, con
    // su base legal. Es el texto que antes mentía (§7 CN-05).
    await expect(page.getByText("Cobros emitidos")).toBeVisible();
    await expect(page.getByText("Se conserva sin tu nombre").first()).toBeVisible();
    await expect(page.getByText(/art\. 30 CCom/).first()).toBeVisible();

    // Los plazos se enseñan con su advertencia: la tabla sigue sin validar.
    await expect(page.getByText(/⟦PENDIENTE: validación jurídica de los plazos/)).toBeVisible();
  });

  test("no enumera los datos de salud del socio", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/perfil/borrar-cuenta");
    await dismissPortalGates(page);

    const health = page.locator("div").filter({ hasText: /^Datos de salud/ }).first();
    await expect(health).toBeVisible();
    // El recuento es el dato: `health-access.ts` devuelve `null` para MEMBER y
    // la pantalla no lo suple. Lo que sí sigue estando es el tratamiento.
    await expect(page.getByText(/Se conservan los \d+ registros/)).toHaveCount(0);
    await expect(page.getByText(/plazo de conservación de tu centro/)).toBeVisible();
  });

  test("sin marcar que se ha leído, el botón no deja pedirlo", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/perfil/borrar-cuenta");
    await dismissPortalGates(page);

    const submit = page.getByRole("button", { name: "Pedir el borrado de mi cuenta" });
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox").check();
    await expect(submit).toBeDisabled(); // falta la contraseña
  });

  test("una contraseña incorrecta no arranca el plazo", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/perfil/borrar-cuenta");
    await dismissPortalGates(page);

    await page.getByRole("checkbox").check();
    await page.locator('input[name="password"]').fill("esta-no-es-la-buena");
    await page.getByRole("button", { name: "Pedir el borrado de mi cuenta" }).click();

    await expect(page.getByText("La contraseña no es correcta.")).toBeVisible({ timeout: 15_000 });
    // Y el formulario sigue ahí: no se ha registrado ninguna solicitud.
    await expect(page.getByRole("button", { name: "Pedir el borrado de mi cuenta" })).toBeVisible();
  });
});

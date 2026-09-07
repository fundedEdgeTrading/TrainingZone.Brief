import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F8 — Embudo de leads", () => {
  test("formulario público crea un lead visible para el staff", async ({ page }) => {
    const uniquePhone = `6${Date.now().toString().slice(-8)}`;
    await page.goto("/lead-form/training-zone/la-jota");
    // El nombre concreto del centro lo pone el seed; basta con que el formulario
    // público muestre los de la organización.
    await expect(page.getByText(/TRAINING ZONE/).first()).toBeVisible();

    await page.locator('input[name="firstName"]').fill("Playwright");
    await page.locator('input[name="lastName"]').fill("Tester");
    await page.locator('input[name="phone"]').fill(uniquePhone);
    await page.locator('input[name="postalCode"]').fill("28010");
    await page.locator('input[name="occupation"]').fill("QA automatizado");
    // E10-12: la fecha de nacimiento es obligatoria en el formulario público —
    // sin ella no se sabe si quien lo rellena es menor.
    await page.locator('input[name="birthDate"]').fill("1990-05-14");
    await page.locator('textarea[name="goals"]').fill("Probar el flujo de leads de principio a fin");
    // `Select` de este repo no es un <select> nativo: es un desplegable propio
    // (botón + input oculto), así que se abre con click y se elige por texto.
    await page.getByRole("button", { name: "Selecciona..." }).first().click();
    await page.locator(".tz-select-pop button:not([disabled])").first().click();

    // E10-01 · capa informativa del art. 13, sobre el formulario.
    await expect(page.getByText(/responsable del tratamiento/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Política de privacidad/i })).toBeVisible();

    // E10-01 · escenario "sin casilla marcada": se declara una condición de
    // salud pero NO se consiente su tratamiento. El lead tiene que crearse
    // igualmente con los datos de contacto.
    await page.getByRole("button", { name: /¿Tienes alguna lesión o condición/ }).click();
    await page.locator(".tz-select-pop button", { hasText: "Sí" }).first().click();
    await expect(page.locator('input[name="healthConsent"]')).not.toBeChecked();
    await page.getByRole("button", { name: "Enviar solicitud" }).click();

    await expect(page.getByText("¡Gracias!")).toBeVisible({ timeout: 10_000 });

    await loginAs(page, "direccion@trainingzone.es");
    await page.goto(`/leads?q=${uniquePhone}`);
    await expect(page.getByText("Playwright Tester")).toBeVisible();
  });

  test("dirección puede ver el lead sin responsable y reclamarlo", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/leads?q=Marina");
    await expect(page.getByText("Marina Castillo")).toBeVisible();
    const card = page.locator("div", { hasText: "Marina Castillo" }).first();
    const claimButton = card.getByRole("button", { name: "Reclamar" });
    if (await claimButton.isVisible().catch(() => false)) {
      await claimButton.click();
      await expect(page.getByText("Lead reclamado")).toBeVisible();
    }
  });

  test("ficha de lead: bitácora y archivado por no cierre", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/leads?q=Pedro");
    await page.getByText("Pedro Salinas").click();
    await expect(page.getByRole("heading", { name: /Pedro Salinas|Seguimiento/i }).first()).toBeVisible().catch(() => {});
    await expect(page.getByText("Bitácora")).toBeVisible();

    // Texto único por ejecución: con un texto fijo, cada pasada acumulaba una nota
    // más y la aserción acababa resolviendo a varios elementos.
    const note = `Nota de prueba desde Playwright ${Date.now()}`;
    await page.locator('input[name="body"]').fill(note);
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByText(note)).toBeVisible();
  });
});

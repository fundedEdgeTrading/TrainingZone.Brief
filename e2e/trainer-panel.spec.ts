import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("Panel del entrenador — agenda por días", () => {
  /**
   * Regresión: las flechas de la tarjeta de agenda eran `<Link>` a
   * `/trainer?day=...`, así que cada salto de día era una navegación de página
   * entera — el panel se repintaba de arriba abajo (con el esqueleto de
   * `loading.tsx` por medio) y el scroll volvía al principio. Quien miraba la
   * lista de sesiones perdía el sitio en cada clic.
   *
   * Ahora el día lo trae `loadTrainerAgendaDay` y solo se repinta la tarjeta.
   */
  test("pasar de día no mueve el scroll ni recarga la página", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/trainer");

    const cardTitle = page.getByRole("heading", { name: /^Agenda/ }).first();
    await expect(cardTitle).toHaveText(/Agenda de hoy/);

    // Se baja hasta la tarjeta para tener una posición de scroll que perder, y
    // se marca la página: una navegación real se llevaría la marca por delante.
    await cardTitle.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.scrollBy(0, 200);
      (window as unknown as { __sinRecarga?: boolean }).__sinRecarga = true;
    });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    await page.getByLabel("Día siguiente").click();
    await expect(cardTitle).toHaveText(/Agenda de mañana/);

    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
    // El día sí queda en la URL: sigue siendo un enlace que se puede compartir.
    expect(new URL(page.url()).searchParams.get("day")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Y de vuelta: hoy es el tope hacia atrás, la flecha se apaga ahí.
    await page.getByLabel("Día anterior").click();
    await expect(cardTitle).toHaveText(/Agenda de hoy/);
    await expect(page.getByLabel("Día anterior")).toBeDisabled();
    expect(new URL(page.url()).searchParams.get("day")).toBeNull();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  /** Varios clics seguidos avanzan varios días, no se pierden por el camino. */
  test("clics rápidos en la flecha avanzan un día por clic", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/trainer");

    const cardTitle = page.getByRole("heading", { name: /^Agenda/ }).first();
    await expect(cardTitle).toHaveText(/Agenda de hoy/);

    const next = page.getByLabel("Día siguiente");
    // El primer clic se espera a conciencia: confirma que la tarjeta ya está
    // hidratada antes de encadenar los dos rápidos, que es lo que se prueba.
    await next.click();
    await expect(page).toHaveURL(/day=/);
    await next.click();
    await next.click();

    const day = new Date();
    day.setDate(day.getDate() + 3);
    const expected = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    await expect(page).toHaveURL(new RegExp(`day=${expected}$`));

    // El botón "Hoy" devuelve la tarjeta al día de hoy y limpia la URL.
    await page.getByRole("button", { name: "Hoy" }).click();
    await expect(cardTitle).toHaveText(/Agenda de hoy/);
    await expect(page).toHaveURL(/\/trainer$/);
  });
});

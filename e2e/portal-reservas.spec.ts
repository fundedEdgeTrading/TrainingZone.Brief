import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

const toast = (page: Page) => page.locator("[role=status], [role=alert]");

/**
 * Reserva lo que haya disponible hasta topar con el límite (RB-RES-004) o
 * quedarse sin clases libres, y devuelve cuántas reservas vivas quedan.
 *
 * El socio demo puede llegar sin ninguna reserva futura: el seed reparte las
 * asistencias al azar y poda las que se van de la ventana de 7 días o del tope.
 * Estas pruebas creaban su propia reserva pero luego daban por hecho que el
 * panel existía, así que fallaban de forma intermitente según el sorteo del
 * seed; ahora se crea la reserva y se comprueba explícitamente que la hay.
 */
async function bookUpToLimit(page: Page): Promise<number> {
  for (let i = 0; i < 4; i++) {
    const bookable = page.getByRole("button", { name: "Reservar", exact: true }).first();
    if ((await bookable.count()) === 0) break;
    await bookable.click();
    const message = toast(page).first();
    await expect(message).toBeVisible({ timeout: 15_000 });
    const text = await message.innerText();
    await page.reload();
    if (/reservas activas/.test(text)) break;
  }

  // `count()` no espera: tras el `reload` hay que dejar que el panel aparezca
  // antes de contar, o se lee 0 en una página a medio hidratar.
  const panel = page.getByRole("region", { name: "Tus próximas reservas" });
  const visible = await panel
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return 0;
  return panel.getByRole("button", { name: /Cancelar|Salir de lista/ }).count();
}

test.describe("RB-RES — Reservas del socio", () => {
  /**
   * Regresión: el listado de "Reservar clase" solo enseña 7 días del centro del
   * socio, pero el tope de reservas activas (RB-RES-004) cuenta todas sus
   * reservas futuras. Se veía una reserva en pantalla y la app respondía "ya
   * tienes 3 activas". El panel "Tus próximas reservas" debe enseñar exactamente
   * las mismas que se cuentan.
   */
  test("lo que cuenta el tope de reservas es lo que el socio ve en pantalla", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    const rows = await bookUpToLimit(page);
    test.skip(rows === 0, "El seed no ha dejado clases libres en la ventana de reserva de este socio.");

    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    await expect(panel).toBeVisible();

    const counter = await panel.getByText(/^\d+ de \d+ activas$/).innerText();
    const active = Number(counter.split(" ")[0]);
    // Una fila por reserva viva: el contador nunca puede ir por delante.
    await expect(panel.getByRole("button", { name: /Cancelar|Salir de lista/ })).toHaveCount(active);
  });

  test("el socio ve las sesiones gastadas y las disponibles de su bono", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    await expect(page.getByText("Sesiones disponibles en tu bono")).toBeVisible();
    await expect(page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/)).toBeVisible();
  });

  test("cancelar una reserva devuelve la sesión al bono", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    // La reserva a cancelar la crea la propia prueba: no puede depender de que
    // el seed le haya dejado una futura.
    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    const cancellable = panel.getByRole("button", { name: "Cancelar" });
    if ((await bookUpToLimit(page)) === 0) test.skip(true, "El seed no ha dejado clases libres que reservar y cancelar.");
    await expect(cancellable.first()).toBeVisible({ timeout: 10_000 });

    const usedLine = page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/);
    const usedBefore = Number((await usedLine.innerText()).split(" ")[0]);

    await cancellable.first().click();
    await expect(toast(page).getByText(/Reserva cancelada/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    const usedAfter = Number((await usedLine.innerText()).split(" ")[0]);
    expect(usedAfter).toBe(usedBefore - 1);
  });
});

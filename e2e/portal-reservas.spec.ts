import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

// Ojo: `[role=alert]` por sí solo también engancha el "route announcer" propio
// de Next.js (`#__next-route-announcer__`, vacío casi siempre), que además
// aparece DESPUÉS del toast en el DOM — con `.last()` eso rompía la lectura
// del toast real. `.tz-toast` es la clase del propio componente de toast.
const toast = (page: Page) => page.locator(".tz-toast");

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

/**
 * El seed reparte asistencias e reservas futuras al azar (ver nota de arriba):
 * el socio demo puede llegar con reservas activas ya puestas por el seed, que
 * cuentan para el tope de RB-RES-004 igual que las que crea el test. Se
 * cancelan todas al principio para partir de un punto de partida determinista.
 */
async function clearActiveBookings(page: Page) {
  const panel = page.getByRole("region", { name: "Tus próximas reservas" });
  for (let i = 0; i < 6; i++) {
    const visible = await panel
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) break;
    const btn = panel.getByRole("button", { name: /Cancelar|Salir de lista/ }).first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await expect(toast(page).first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
  }
}

test.describe("RB-RES — Reservas del socio", () => {
  /**
   * RB-AGENDA-003: un socio puede tener varios bonos activos a la vez si son de
   * distinta modalidad, y de centros distintos de la misma organización. Marta
   * (el seed) tiene bono de EP en Puerta del Carmen + bono de grupos reducidos
   * en La Jota — la lista de "Reservar clase" debe mezclar sesiones de ambos
   * centros, con el centro indicado en cada tarjeta, y reservar de cada tipo
   * debe funcionar sin que el filtro plano "el centro del socio" lo bloquee.
   *
   * Va primero en el fichero para partir de un socio sin reservas activas
   * todavía, y al final deshace sus propias reservas: los demás tests de este
   * fichero reservan/cancelan sobre el mismo socio demo y dan por hecho su
   * propio punto de partida (tope de reservas activas, saldo del bono).
   */
  test("el socio ve y reserva EP de un centro y grupo del otro según sus dos bonos", async ({ page }) => {
    // Limpia el punto de partida, reserva dos veces y deshace las dos reservas:
    // varias vueltas de reload+toast que pueden agotar el timeout por defecto
    // (30s) si el seed le había dejado reservas previas que cancelar primero.
    test.setTimeout(75_000);

    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");

    // El seed puede haberle puesto reservas futuras al azar (ver nota de
    // `clearActiveBookings`): sin este paso, esas reservas ya podían agotar el
    // tope de RB-RES-004 antes de que el test reservase nada, y la segunda
    // reserva (grupo) fallaba en silencio con el toast de éxito de la primera
    // todavía visible en pantalla.
    await clearActiveBookings(page);

    // `count()` no espera (ver nota de `bookUpToLimit` más abajo): hay que dejar
    // que al menos una tarjeta aparezca antes de contar, o se lee 0 en una
    // página a medio hidratar.
    await page
      .getByRole("article")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});

    // Excluye tarjetas que Marta ya tenga reservadas: el seed puede haberle
    // dejado una reserva de una sesión de hoy cuya hora ya pasó, que sigue
    // apareciendo aquí como "Reservada" (aunque ya no cuenta para el tope de
    // RB-RES-004 ni aparece en "Tus próximas reservas") pero no tiene botón
    // Reservar — `.first()` sin este filtro podía escoger esa y colgarse.
    const bookableButton = () => page.getByRole("button", { name: /Reservar|Unirme a lista/ });
    const epCard = page
      .getByRole("article")
      .filter({ hasText: "Entrenamiento personal" })
      .filter({ hasText: "Puerta del Carmen" })
      .filter({ has: bookableButton() })
      .first();
    const groupCard = page
      .getByRole("article")
      .filter({ hasText: "Grupo reducido" })
      .filter({ hasText: "La Jota" })
      .filter({ has: bookableButton() })
      .first();

    const hasBoth = (await epCard.count()) > 0 && (await groupCard.count()) > 0;
    test.skip(
      !hasBoth,
      "El seed no ha dejado, en la ventana de 7 días, una sesión de EP en Puerta del Carmen y otra de grupo en La Jota."
    );

    // Marta no tiene ningún otro bono en Puerta del Carmen (solo este segundo
    // bono de EP): el centro solo basta para identificar su fila en el panel.
    // Para La Jota sí puede tener otras reservas de antes, así que se guarda
    // también el nombre de la sesión de grupo para distinguir su fila.
    const groupLabel = (await groupCard.getAttribute("aria-label")) ?? "";
    const groupName = groupLabel.split(" · ")[0];

    // `.last()`: los toasts se apilan y tardan ~4s en desaparecer (ver
    // `DEFAULT_DURATION` en components/ui/toast.tsx) — el de la primera
    // reserva puede seguir visible cuando llega el de la segunda, y ambos
    // dicen "¡Reserva confirmada!", así que comprobar sin `.last()` es
    // ambiguo (violación de modo estricto) en vez de mirar el más reciente.
    await epCard.getByRole("button", { name: /Reservar|Unirme a lista/, exact: false }).click();
    await expect(toast(page).last()).toContainText(/¡Reserva confirmada!|Te has unido a la lista de espera\./, {
      timeout: 15_000,
    });

    await groupCard.getByRole("button", { name: /Reservar|Unirme a lista/, exact: false }).click();
    await expect(toast(page).last()).toContainText(/¡Reserva confirmada!|Te has unido a la lista de espera\./, {
      timeout: 15_000,
    });

    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Puerta del Carmen").first()).toBeVisible();
    await expect(panel.getByText("La Jota").first()).toBeVisible();

    // Limpieza: cancela las dos reservas que ha creado el propio test, para no
    // dejar al socio demo con reservas de más de cara a los siguientes tests.
    // De todos los `div` que envuelven el botón Cancelar Y contienen el texto
    // buscado (la fila y sus ancestros: la lista, la sección), el ÚLTIMO en el
    // orden del documento es el más interno — la fila concreta. Filtrar solo
    // por texto no basta: los `div` de texto anidados dentro de la fila
    // también lo "contienen" y son más internos que la fila pero no envuelven
    // el botón.
    const cancelButton = () => page.getByRole("button", { name: /Cancelar|Salir de lista/ });
    const rowContaining = (...texts: string[]) => {
      let loc = panel.locator("div").filter({ has: cancelButton() });
      for (const t of texts) loc = loc.filter({ hasText: t });
      return loc.last();
    };

    await rowContaining("Puerta del Carmen")
      .getByRole("button", { name: /Cancelar|Salir de lista/ })
      .click();
    await expect(toast(page).last()).toContainText(/Reserva cancelada\.|Has salido de la lista de espera\./, {
      timeout: 15_000,
    });

    await rowContaining(groupName, "La Jota")
      .getByRole("button", { name: /Cancelar|Salir de lista/ })
      .click();
    await expect(toast(page).last()).toContainText(/Reserva cancelada\.|Has salido de la lista de espera\./, {
      timeout: 15_000,
    });
  });

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

    // Marta tiene dos bonos activos (EP + grupos, RB-AGENDA-003): una tarjeta
    // de saldo por modalidad, no una sola.
    await expect(page.getByText("Sesiones disponibles en tu bono").first()).toBeVisible();
    await expect(page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/).first()).toBeVisible();
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

    // Marta tiene dos bonos (EP + grupos, RB-AGENDA-003): la reserva creada
    // pudo cargarse en cualquiera de las dos tarjetas de saldo, así que se
    // suman las gastadas de todas en vez de asumir que solo hay una.
    const usedLine = page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/);
    const totalUsed = async () =>
      (await usedLine.allInnerTexts()).reduce((sum, t) => sum + Number(t.split(" ")[0]), 0);
    const usedBefore = await totalUsed();

    await cancellable.first().click();
    await expect(toast(page).getByText(/Reserva cancelada/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    const usedAfter = await totalUsed();
    expect(usedAfter).toBe(usedBefore - 1);
  });
});

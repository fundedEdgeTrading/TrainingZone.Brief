import { test, expect, type Page } from "@playwright/test";
import { dismissPortalGates, loginAs } from "./helpers";
import { prisma } from "@/lib/prisma";

// Ojo: `[role=alert]` por sí solo también engancha el "route announcer" propio
// de Next.js (`#__next-route-announcer__`, vacío casi siempre), que además
// aparece DESPUÉS del toast en el DOM — con `.last()` eso rompía la lectura
// del toast real. `.tz-toast` es la clase del propio componente de toast.
const toast = (page: Page) => page.locator(".tz-toast");

/**
 * RB-RES-005: cancelar una reserva BOOKED a menos de CANCELLATION_WINDOW_HOURS
 * (24h por defecto) ya no lanza la acción directamente — abre un modal de
 * confirmación ("Vas a perder esta sesión", booking-button.tsx), porque esa
 * cancelación NO devuelve la sesión al bono. Sin confirmarlo no se llama al
 * servidor y no hay toast que esperar. Que la reserva caiga dentro o fuera de
 * la ventana depende de la hora a la que se ejecute la suite, así que se
 * confirma solo si el modal aparece.
 */
async function confirmForfeitIfAsked(page: Page) {
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Cancelar de todos modos" });
  const shown = await confirm
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (shown) await confirm.click();
}

/**
 * Reserva lo que haya disponible hasta quedarse sin clases libres o sin saldo
 * en el bono, y devuelve cuántas reservas vivas quedan.
 *
 * El socio demo puede llegar sin ninguna reserva futura: el seed reparte las
 * asistencias al azar y poda las que se van de la ventana de 7 días.
 * Estas pruebas creaban su propia reserva pero luego daban por hecho que el
 * panel existía, así que fallaban de forma intermitente según el sorteo del
 * seed; ahora se crea la reserva y se comprueba explícitamente que la hay.
 */
async function bookAvailable(page: Page): Promise<number> {
  for (let i = 0; i < 4; i++) {
    const bookable = page.getByRole("button", { name: "Reservar", exact: true }).first();
    if ((await bookable.count()) === 0) break;
    await bookable.click();
    const message = toast(page).first();
    await expect(message).toBeVisible({ timeout: 15_000 });
    const text = await message.innerText();
    await page.reload();
    await dismissPortalGates(page);
    if (/no te quedan sesiones/i.test(text)) break;
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
 * el socio demo puede llegar con reservas activas ya puestas por el seed. Se
 * cancelan todas al principio para partir de un punto de partida determinista.
 */
/**
 * Deja al socio sin reservas activas. Devuelve `true` si lo ha conseguido.
 *
 * El tope de vueltas es generoso a propósito: el seed reparte reservas al azar
 * y puede dejar bastantes, y quedarse a medias no es inocuo — un test que
 * después mida el saldo del bono puede acabar cancelando una reserva sembrada
 * (que no descontó bono) en vez de la suya. La espera del panel tampoco puede
 * ser corta: es un `reload` completo por vuelta.
 */
async function clearActiveBookings(page: Page): Promise<boolean> {
  const panel = page.getByRole("region", { name: "Tus próximas reservas" });
  for (let i = 0; i < 16; i++) {
    const visible = await panel
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    // Sin panel no hay reservas activas: objetivo cumplido.
    if (!visible) return true;
    const btn = panel.getByRole("button", { name: /Cancelar|Salir de lista/ }).first();
    if ((await btn.count()) === 0) return true;
    await btn.click();
    await confirmForfeitIfAsked(page);
    await expect(toast(page).first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await dismissPortalGates(page);
  }
  return false;
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
   * propio punto de partida (saldo del bono).
   */
  test("el socio ve y reserva EP de un centro y grupo del otro según sus dos bonos", async ({ page }) => {
    // Limpia el punto de partida, reserva dos veces y deshace las dos reservas:
    // varias vueltas de reload+toast que pueden agotar el timeout por defecto
    // (30s) si el seed le había dejado reservas previas que cancelar primero.
    test.setTimeout(75_000);

    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");
    await dismissPortalGates(page);

    // El seed puede haberle puesto reservas futuras al azar (ver nota de
    // `clearActiveBookings`): sin este paso, una reserva previa de grupo o EP
    // podía agotar el saldo del bono antes de que el test reservase nada, y la
    // segunda reserva (grupo) fallaba en silencio con el toast de éxito de la
    // primera todavía visible en pantalla.
    await clearActiveBookings(page);

    // `count()` no espera (ver nota de `bookAvailable` más abajo): hay que dejar
    // que al menos una tarjeta aparezca antes de contar, o se lee 0 en una
    // página a medio hidratar.
    await page
      .getByRole("article")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});

    // Excluye tarjetas que Marta ya tenga reservadas: el seed puede haberle
    // dejado una reserva de una sesión de hoy cuya hora ya pasó, que sigue
    // apareciendo aquí como "Reservada" (aunque ya no aparece en "Tus próximas
    // reservas") pero no tiene botón Reservar — `.first()` sin este filtro
    // podía escoger esa y colgarse.
    //
    // `.last()` y no `.first()`: la lista va en orden ascendente, así que
    // `.first()` es la clase MÁS PRÓXIMA — justo la que puede cruzar el corte
    // de antelación mínima (RB-RES-001, 30 min) entre que la página se pinta y
    // el test llega a pulsar, después de limpiar reservas y reservar la otra.
    // Cuando eso pasaba, el servidor rechazaba la reserva con "empieza en menos
    // de 30 minutos" mientras el toast de la reserva ANTERIOR seguía en
    // pantalla, así que la aserción de toast pasaba igualmente y el fallo se
    // manifestaba mucho después, en el panel. La clase más lejana de la ventana
    // de 7 días no tiene esa carrera.
    const bookableButton = () => page.getByRole("button", { name: /Reservar|Unirme a lista/ });
    const epCard = page
      .getByRole("article")
      .filter({ hasText: "Entrenamiento personal" })
      .filter({ hasText: "Puerta del Carmen" })
      .filter({ has: bookableButton() })
      .last();
    const groupCard = page
      .getByRole("article")
      .filter({ hasText: "Grupo reducido" })
      .filter({ hasText: "La Jota" })
      .filter({ has: bookableButton() })
      .last();

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
    await confirmForfeitIfAsked(page);
    await expect(toast(page).last()).toContainText(/Reserva cancelada\.|Has salido de la lista de espera\./, {
      timeout: 15_000,
    });

    await rowContaining(groupName, "La Jota")
      .getByRole("button", { name: /Cancelar|Salir de lista/ })
      .click();
    await confirmForfeitIfAsked(page);
    await expect(toast(page).last()).toContainText(/Reserva cancelada\.|Has salido de la lista de espera\./, {
      timeout: 15_000,
    });
  });

  /**
   * El socio ya no tiene un tope fijo de reservas activas: puede reservar de
   * una tirada tantas veces como sesiones le queden en el bono. El contador de
   * "Tus próximas reservas" debe enseñar exactamente las mismas reservas que
   * el socio ve en el panel, sin comparar contra ningún máximo.
   */
  test("el contador de próximas reservas coincide con las filas del panel", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");
    await dismissPortalGates(page);

    const rows = await bookAvailable(page);
    test.skip(rows === 0, "El seed no ha dejado clases libres en la ventana de reserva de este socio.");

    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    await expect(panel).toBeVisible();

    const counter = await panel.getByText(/^\d+ reservas?$/).innerText();
    const active = Number(counter.split(" ")[0]);
    // Una fila por reserva viva: el contador nunca puede ir por delante.
    await expect(panel.getByRole("button", { name: /Cancelar|Salir de lista/ })).toHaveCount(active);
  });

  test("el socio ve las sesiones gastadas y las disponibles de su bono", async ({ page }) => {
    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");
    await dismissPortalGates(page);

    // Marta tiene dos bonos activos (EP + grupos, RB-AGENDA-003): una tarjeta
    // de saldo por modalidad, no una sola.
    await expect(page.getByText("Sesiones disponibles en tu bono").first()).toBeVisible();
    await expect(page.getByText(/\d+ sesion(es)? gastadas? de \d+ del bono/).first()).toBeVisible();
  });

  test("cancelar una reserva devuelve la sesión al bono", async ({ page }) => {
    test.setTimeout(75_000);

    await loginAs(page, "socio@trainingzone.es");
    await page.goto("/portal/agenda");
    await dismissPortalGates(page);

    // Punto de partida determinista: se cancelan las reservas que el seed haya
    // dejado, para que el panel contenga solo la que crea esta prueba.
    const cleared = await clearActiveBookings(page);
    test.skip(!cleared, "No se ha podido dejar al socio sin reservas activas para partir de un estado limpio.");

    // RB-RES-005: cancelar a menos de 24h NO devuelve la sesión al bono (y pide
    // confirmar un modal). Esta prueba mide justo la devolución, así que se
    // reserva la clase MÁS LEJANA de la ventana de 7 días, siempre fuera de
    // plazo. El listado va en orden ascendente (getBookableSessions →
    // expandOccurrences, y la página agrupa en un Map que conserva el orden).
    await page.getByRole("article").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    const bookable = page.getByRole("button", { name: "Reservar", exact: true });
    if ((await bookable.count()) === 0) test.skip(true, "El seed no ha dejado clases libres que reservar y cancelar.");
    await bookable.last().click();
    await expect(toast(page).first()).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await dismissPortalGates(page);

    // El saldo se comprueba contra la BASE DE DATOS y no contra el texto
    // "N sesiones gastadas de M" del portal: ese número agrega los dos bonos de
    // Marta (EP + grupos, RB-AGENDA-003) y además se recorta en 0
    // (getSessionBalances), así que si el saldo sembrado queda por encima de las
    // sesiones incluidas la cifra no se mueve al devolver y la prueba medía algo
    // insensible a lo que dice medir.
    const created = await prisma.booking.findFirstOrThrow({
      where: { member: { email: "socio@trainingzone.es" }, status: "BOOKED" },
      orderBy: { bookedAt: "desc" },
      select: { id: true, subscriptionId: true },
    });
    test.skip(
      created.subscriptionId == null,
      "La reserva creada no descontó bono (cuota ilimitada o lista de espera): no hay devolución que medir."
    );
    const remainingBefore = (
      await prisma.subscription.findUniqueOrThrow({
        where: { id: created.subscriptionId! },
        select: { sessionsRemaining: true },
      })
    ).sessionsRemaining;

    // Tras la limpieza el panel tiene exactamente esa reserva. `exact: true`
    // descarta además el "Cancelar ⚠︎" de una reserva dentro de la ventana de
    // penalización, que por diseño no devolvería la sesión.
    const panel = page.getByRole("region", { name: "Tus próximas reservas" });
    const cancellable = panel.getByRole("button", { name: "Cancelar", exact: true });
    await expect(cancellable).toHaveCount(1, { timeout: 10_000 });

    await cancellable.click();
    await expect(toast(page).getByText(/Reserva cancelada/i)).toBeVisible({ timeout: 15_000 });

    const remainingAfter = (
      await prisma.subscription.findUniqueOrThrow({
        where: { id: created.subscriptionId! },
        select: { sessionsRemaining: true },
      })
    ).sessionsRemaining;
    expect(remainingAfter).toBe((remainingBefore ?? 0) + 1);
  });
});

import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { bookSessionForMemberAsStaff } from "@/lib/agenda-queries";
import { loginAs, isoDay } from "./helpers";
import { createBookingMember, deleteBookingMembers, type Fixture } from "./fixtures/booking-members";

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

/**
 * QA-RES-03 y QA-RES-05: una ocurrencia de una serie se mueve o se borra SOLA.
 * Antes arrastrarla movía la fecha base de la serie (y dejaba las reservas en
 * su día viejo) y borrarla se llevaba todas las ocurrencias, devolviendo el bono
 * de todas. La serie la monta el test por base de datos, con un socio apuntado
 * a dos semanas seguidas por el camino real del mostrador (con cobro).
 */
test.describe("QA-RES-03/05 — Mover y borrar una ocurrencia de una serie", () => {
  let socio: Fixture;
  const stamp = Date.now();
  const titles = { move: `Grupo mover ${stamp}`, remove: `Grupo borrar ${stamp}` };

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plusDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const weekdayIdx = (d: Date) => (d.getDay() + 6) % 7;

  test.beforeAll(async () => {
    socio = await createBookingMember({ tag: `serie-${stamp}`, service: "GROUP" });
  });

  test.afterAll(async () => {
    await deleteBookingMembers([socio]);
    await prisma.classSession.deleteMany({ where: { name: { in: Object.values(titles) } } });
  });

  /** Serie semanal que empieza mañana, con el socio apuntado a la 2.ª y la 3.ª ocurrencia. */
  async function seriesWithBookings(name: string) {
    const trainer = await prisma.user.findFirstOrThrow({ where: { email: "entrenador@trainingzone.es" } });
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + 1);
    const series = await prisma.classSession.create({
      data: {
        orgId: trainer.orgId,
        centerId: trainer.centerId!,
        trainerId: trainer.id,
        name,
        classType: "Grupo reducido",
        date: base,
        startTime: "07:00",
        endTime: "08:00",
        capacity: 4,
        recurrence: "WEEKLY",
      },
    });
    const [first, second] = [plusDays(base, 7), plusDays(base, 14)];
    for (const day of [first, second]) {
      const booked = await bookSessionForMemberAsStaff(trainer.orgId, {
        sessionId: series.id,
        memberId: socio.memberId,
        occurrenceDate: day,
      });
      expect(booked.ok).toBe(true);
    }
    const bookingOn = (day: Date) =>
      prisma.booking.findFirst({ where: { memberId: socio.memberId, occurrenceDate: day, session: { name } } });
    return { series, first, second, bookingOn };
  }

  test("arrastrar 'solo esta' ocurrencia se lleva su reserva y deja la serie en su sitio", async ({ page }) => {
    const { series, first, second, bookingOn } = await seriesWithBookings(titles.move);
    const fromIdx = weekdayIdx(first);
    const toIdx = fromIdx === 6 ? 5 : fromIdx + 1;
    const target = plusDays(first, toIdx - fromIdx);

    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto(`/agenda?week=${iso(first)}`);
    const card = page.locator(`[title="${titles.move}"]`).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    const from = (await card.boundingBox())!;
    const toHeader = (await page.locator("div.flex-1.text-center.py-2").nth(toIdx).boundingBox())!;
    const y = from.y + Math.min(10, from.height / 2);
    await page.mouse.move(from.x + from.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(toHeader.x + toHeader.width / 2, y, { steps: 12 });
    await page.mouse.up();

    // Soltar una ocurrencia de una serie pregunta el alcance antes de guardar.
    await expect(scopeDialog(page)).toBeVisible();
    await scopeDialog(page).getByText("Esta sesión", { exact: true }).click();
    await scopeDialog(page).getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(async () => (await bookingOn(target))?.sessionId ?? null, { timeout: 15_000 })
      .not.toBeNull();
    const moved = (await bookingOn(target))!;
    expect(moved.sessionId).not.toBe(series.id);
    expect(await bookingOn(first)).toBeNull();
    // La serie no se ha movido y la otra reserva sigue en su día.
    const row = await prisma.classSession.findUniqueOrThrow({ where: { id: series.id } });
    expect(iso(row.date)).toBe(iso(series.date));
    expect(await bookingOn(second)).not.toBeNull();
  });

  test("borrar 'solo esta' ocurrencia devuelve solo su sesión y la serie sigue", async ({ page }) => {
    const { first, second, bookingOn } = await seriesWithBookings(titles.remove);
    const balance = async () =>
      (await prisma.subscription.findFirstOrThrow({ where: { memberId: socio.memberId, status: "ACTIVE" } }))
        .sessionsRemaining ?? 0;
    const before = await balance();

    await loginAs(page, "entrenador@trainingzone.es");
    await openSessionInAgenda(page, titles.remove, iso(first));
    await page.getByRole("button", { name: "Eliminar" }).click();

    const del = page.getByRole("dialog", { name: "Eliminar sesión periódica" });
    await expect(del).toBeVisible();
    await del.getByText("Esta sesión", { exact: true }).click();
    await del.getByRole("button", { name: "Eliminar" }).click();
    await expect(toast(page).getByText("Sesión eliminada")).toBeVisible({ timeout: 15_000 });

    expect(await bookingOn(first)).toBeNull();
    expect(await balance()).toBe(before + 1);
    const kept = await bookingOn(second);
    expect(kept, "la ocurrencia siguiente conserva su reserva").not.toBeNull();
    expect(await prisma.classSession.findUnique({ where: { id: kept!.sessionId } })).not.toBeNull();
  });
});

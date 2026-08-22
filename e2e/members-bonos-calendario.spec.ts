import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers";
import { createBookingMember, deleteBookingMembers, type Fixture } from "./fixtures/booking-members";
import { prisma } from "@/lib/prisma";

/**
 * RB-PAGO-008: ajuste manual del saldo de un bono desde la pestaña "Bonos y
 * calendario" de la ficha del socio, y calendario mensual de sus
 * entrenamientos. Del lado de pista el permiso es del Entrenador Admin (F1),
 * no de cualquier entrenador, así que el caso principal se prueba con su
 * cuenta y el entrenador normal se comprueba en negativo.
 */

const fixtures: Fixture[] = [];

/** Planes de cuota creados por el test (la semilla solo trae bonos de sesiones). */
const createdPlanIds: string[] = [];

test.afterAll(async () => {
  await deleteBookingMembers(fixtures);
  await prisma.membershipPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
});

/**
 * Convierte el bono del socio de prueba en una cuota mensual ilimitada
 * (`sessionsRemaining` null). La semilla no trae ningún plan MONTHLY/ONLINE, y
 * el caso "ilimitado ≠ cero" es justo el que hay que blindar.
 */
async function makeSubscriptionUnlimited(memberId: string) {
  const sub = await prisma.subscription.findFirstOrThrow({
    where: { memberId },
    select: { id: true, plan: { select: { orgId: true } } },
  });
  const plan = await prisma.membershipPlan.create({
    data: {
      orgId: sub.plan.orgId,
      name: "Cuota mensual ilimitada (e2e)",
      type: "MONTHLY",
      sessionsIncluded: null,
      priceCents: 4900,
      active: true,
    },
  });
  createdPlanIds.push(plan.id);
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { planId: plan.id, sessionsRemaining: null },
  });
}

async function openBonosTab(page: Page, memberId: string) {
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Bonos y calendario" }).click();
  await expect(page.getByText("Bonos vigentes")).toBeVisible();
}

function balanceInput(page: Page) {
  return page.getByLabel("Sesiones restantes").first();
}

test.describe("Bonos y calendario en la ficha del socio", () => {
  test("un Entrenador Admin ajusta el saldo de un bono y persiste", async ({ page }) => {
    const fixture = await createBookingMember({ tag: `bonos${Date.now()}`, service: "EP" });
    fixtures.push(fixture);

    await loginAs(page, "marcos.iglesias@trainingzone.es");
    await openBonosTab(page, fixture.memberId);

    const input = balanceInput(page);
    const before = Number(await input.inputValue());

    await page.getByRole("button", { name: "Sumar una sesión" }).first().click();
    await page.getByRole("button", { name: "Sumar una sesión" }).first().click();
    await expect(input).toHaveValue(String(before + 2));

    await page.getByRole("button", { name: "Guardar" }).first().click();
    await expect(page.getByText("Saldo actualizado.")).toBeVisible();

    // El saldo tiene que haber ido a la base de datos, no solo al estado local.
    await page.reload();
    await page.getByRole("button", { name: "Bonos y calendario" }).click();
    await expect(balanceInput(page)).toHaveValue(String(before + 2));
  });

  test("un entrenador normal ve el saldo pero no puede ajustarlo", async ({ page }) => {
    const fixture = await createBookingMember({ tag: `bonosro${Date.now()}`, service: "EP" });
    fixtures.push(fixture);

    await loginAs(page, "entrenador@trainingzone.es");
    await openBonosTab(page, fixture.memberId);

    await expect(page.getByText("Sesiones restantes").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sumar una sesión" })).toHaveCount(0);
    await expect(balanceInput(page)).toHaveCount(0);
  });

  test("el saldo no puede bajar de cero", async ({ page }) => {
    const fixture = await createBookingMember({ tag: `bonoscero${Date.now()}`, service: "EP" });
    fixtures.push(fixture);

    await loginAs(page, "sergio@trainingzone.es");
    await openBonosTab(page, fixture.memberId);

    const input = balanceInput(page);
    const before = Number(await input.inputValue());
    const minus = page.getByRole("button", { name: "Restar una sesión" }).first();

    for (let i = 0; i < before; i++) await minus.click();
    await expect(input).toHaveValue("0");
    // En 0 el botón de restar se desactiva: no hay forma de pedir un negativo.
    await expect(minus).toBeDisabled();

    await page.getByRole("button", { name: "Guardar" }).first().click();
    await expect(page.getByText("Saldo actualizado.")).toBeVisible();
    await expect(balanceInput(page)).toHaveValue("0");

    // Contratación lee el mismo campo y debe coincidir. Ese bloque solo lo ve
    // quien pasa `canManageBilling`, de ahí que se compruebe con dirección y no
    // con el Entrenador Admin del primer test.
    await page.getByRole("button", { name: "Contratación" }).click();
    await expect(page.getByText("0 sesiones")).toBeVisible();
  });

  test("un bono ilimitado no ofrece controles de ajuste", async ({ page }) => {
    const fixture = await createBookingMember({ tag: `bonosilim${Date.now()}`, service: "EP" });
    fixtures.push(fixture);
    await makeSubscriptionUnlimited(fixture.memberId);

    await loginAs(page, "sergio@trainingzone.es");
    await openBonosTab(page, fixture.memberId);

    await expect(page.getByText("Ilimitado", { exact: true })).toBeVisible();
    // Ni stepper ni Guardar: la UI nunca ofrece un camino para convertir un
    // saldo null en numérico.
    await expect(page.getByRole("button", { name: "Sumar una sesión" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restar una sesión" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);
  });

  test("navegar por meses no cambia la URL ni la pestaña activa", async ({ page }) => {
    const fixture = await createBookingMember({ tag: `bonosmes${Date.now()}`, service: "GROUP" });
    fixtures.push(fixture);
    // El socio se acaba de crear, así que la flecha "‹" estaría desactivada
    // (no se pagina por debajo del alta). Se retrasa el alta dos años para
    // poder cruzar además el borde de la ventana precargada (12 meses), que es
    // donde entra la carga perezosa por acción de servidor.
    await prisma.member.update({
      where: { id: fixture.memberId },
      data: { joinedAt: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) },
    });

    await loginAs(page, "sergio@trainingzone.es");
    await openBonosTab(page, fixture.memberId);
    await expect(page.getByText("Calendario de entrenamientos")).toBeVisible();

    const urlBefore = page.url();
    const monthLabel = page.getByText(/^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/);
    const before = await monthLabel.textContent();

    // 13 pasos: se cruza el borde de la ventana precargada y el último mes tiene
    // que llegar por `fetchMemberSessionsMonth`, sin tocar la URL.
    for (let i = 0; i < 13; i++) {
      await page.getByRole("button", { name: "Mes anterior" }).click();
    }
    await expect(monthLabel).not.toHaveText(before ?? "");
    await expect(page.getByRole("button", { name: "Mes anterior" })).toBeEnabled();

    // La regresión que sostiene el diseño: sin cambio de URL no se re-renderiza
    // la página (y no se escribe una fila falsa de HEALTH_RECORD_READ).
    expect(page.url()).toBe(urlBefore);
    await expect(page.getByText("Bonos vigentes")).toBeVisible();
    await expect(page.getByText("Calendario de entrenamientos")).toBeVisible();
  });
});

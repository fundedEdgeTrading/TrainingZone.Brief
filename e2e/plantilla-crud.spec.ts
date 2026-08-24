import { test, expect, type Page, type Locator } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs } from "./helpers";
import { createStaffFixture, deleteStaffFixture, STAFF_PASSWORD } from "./fixtures/staff-members";

/**
 * RB-RRHH-014 — CRUD de plantilla. Lo que se prueba aquí no es la tabla, sino
 * las tres decisiones de la baja: a quién alcanza cada rol, qué se conserva y
 * qué corta el acceso.
 */

const OWNER = "direccion@trainingzone.es";

/** La tabla de equipo pagina de 12 en 12: avanza hasta dar con la fila. */
async function staffRow(page: Page, email: string): Promise<Locator> {
  const row = page.locator("table tr", { hasText: email });
  const next = page.getByRole("button", { name: "Página siguiente" });

  for (let page_ = 1; page_ <= 8; page_++) {
    try {
      await expect(row.first()).toBeVisible({ timeout: 2_000 });
      return row.first();
    } catch {
      if (await next.isDisabled()) break;
      await next.click();
    }
  }
  throw new Error(`No hay ninguna fila de plantilla para ${email}`);
}

async function darDeBaja(page: Page, row: Locator) {
  await row.getByRole("button", { name: "Dar de baja" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Dar de baja" }).click();
}

test.describe("Plantilla — edición y baja (RB-RRHH-014)", () => {
  test("editar la ficha de un trabajador y darle de baja: sin rastro, la ficha se borra", async ({ page }) => {
    const staff = await createStaffFixture({ tag: "purga" });

    await loginAs(page, OWNER);
    await page.goto("/organization");

    const row = await staffRow(page, staff.email);
    await row.getByRole("button", { name: "Editar" }).click();
    const drawer = page.getByRole("dialog", { name: staff.name });
    await expect(drawer).toBeVisible();
    await drawer.locator('input[name="name"]').fill(`${staff.name} (editada)`);
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Ficha actualizada")).toBeVisible({ timeout: 15_000 });
    // Contra la base, no contra la tabla: tras la acción la tabla se repinta y
    // vuelve a la primera página, así que dónde acaba la fila es ruido — lo que
    // importa es que el cambio se ha guardado.
    const edited = await prisma.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(edited.name).toBe(`${staff.name} (editada)`);

    // No ha dado clases, ni cobrado, ni escrito nada: no hay histórico que
    // conservar, así que la baja borra la fila y libera su email.
    await darDeBaja(page, await staffRow(page, staff.email));
    await expect(page.getByText("Persona eliminada")).toBeVisible({ timeout: 15_000 });
    expect(await prisma.user.count({ where: { email: staff.email } })).toBe(0);

    await deleteStaffFixture("purga");
  });

  test("con rastro, la baja conserva la ficha, corta el acceso y se puede reincorporar", async ({ page }) => {
    const staff = await createStaffFixture({ tag: "historico", withHistory: true });

    await loginAs(page, OWNER);
    await page.goto("/organization");
    await darDeBaja(page, await staffRow(page, staff.email));
    await expect(page.getByText("Baja registrada")).toBeVisible({ timeout: 15_000 });

    const afterRemoval = await prisma.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(afterRemoval.deactivatedAt).not.toBeNull();
    // Fuera de todos sus centros: ya no ocupa plaza en la plantilla de ninguno.
    expect(await prisma.centerMembership.count({ where: { userId: staff.userId } })).toBe(0);

    // Ya no entra, aunque su contraseña siga siendo la correcta.
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(staff.email);
    await page.locator('input[type="password"]').fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("Credenciales incorrectas.")).toBeVisible({ timeout: 15_000 });

    await loginAs(page, OWNER);
    await page.goto("/organization");
    const row = await staffRow(page, staff.email);
    await expect(row.getByText(/Baja ·/)).toBeVisible();
    await row.getByRole("button", { name: "Reincorporar" }).click();
    await expect(page.getByText(/vuelve a la plantilla/)).toBeVisible({ timeout: 15_000 });

    // Y con la reincorporación vuelven el acceso y su imputación primaria.
    await loginAs(page, staff.email, STAFF_PASSWORD);
    expect(await prisma.centerMembership.count({ where: { userId: staff.userId, isPrimary: true } })).toBe(1);

    await deleteStaffFixture("historico");
  });

  test("no se da de baja a quien tiene sesiones por delante", async ({ page }) => {
    await loginAs(page, OWNER);
    await page.goto("/organization");

    const row = await staffRow(page, "entrenador@trainingzone.es");
    await darDeBaja(page, row);
    await expect(page.getByText(/Reasígnalas en la agenda/)).toBeVisible({ timeout: 15_000 });

    const trainer = await prisma.user.findFirstOrThrow({ where: { email: "entrenador@trainingzone.es" } });
    expect(trainer.deactivatedAt).toBeNull();
  });

  test("dirección de centro gestiona su plantilla y solo la suya", async ({ page }) => {
    await loginAs(page, "direccion.lajota@trainingzone.es");
    await page.goto("/organization");
    await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();

    // Entra por la plantilla, no por el resto de Organización.
    await expect(page.getByRole("heading", { name: "Marca" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Productos" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Nueva persona" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Imputar a un centro" })).toHaveCount(0);

    // Su gente sí; la de otro centro y los roles de organización, no.
    await expect(page.getByText("recepcion.lajota@trainingzone.es").first()).toBeVisible();
    await expect(page.getByText("recepcion.puertacarmen@trainingzone.es")).toHaveCount(0);
    // La plantilla es personal, no socios: el filtro de ámbito trae su propio
    // `role` y, mal compuesto, dejaba entrar a los socios del centro.
    await expect(page.getByText("socio@trainingzone.es")).toHaveCount(0);
    await expect(page.getByText(OWNER)).toHaveCount(0);
    await expect(page.getByText("sergio@trainingzone.es")).toHaveCount(0);
    await expect(page.getByText("rrhh@trainingzone.es")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dar de baja" }).first()).toBeVisible();
  });

  test("RRHH da de alta pero no da de baja", async ({ page }) => {
    await loginAs(page, "rrhh@trainingzone.es");
    await page.goto("/organization");
    await expect(page.getByRole("button", { name: "+ Nueva persona" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Dar de baja" })).toHaveCount(0);
  });

  test.afterAll(async () => {
    await deleteStaffFixture("purga");
    await deleteStaffFixture("historico");
    await prisma.$disconnect();
  });
});

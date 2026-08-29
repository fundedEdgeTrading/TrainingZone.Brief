import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * F10 — Tareas manuales. Recorrido completo por la pantalla: crear un encargo,
 * verlo en el tablero, reasignarlo (conservando de quién viene), filtrar por
 * entrenador y darlo por hecho, comprobando que sale de las vistas activas y
 * queda en el histórico.
 */

/** El entrenador al que se encarga la tarea, y el compañero al que se reasigna. */
const TRAINER = "Marcos Iglesias";
const OTHER_TRAINER = "Laura Gimeno";
const DIRECTOR = "Carmen Otal";

const TITLE = `Revisar el pulsómetro de la sala ${Date.now().toString().slice(-6)}`;

/**
 * `Select` de este repo no es un <select> nativo: es un desplegable propio
 * (botón + input oculto) — mismo patrón que alta-socio-bonos.spec.ts.
 */
async function chooseInField(page: Page, fieldScope: Locator, optionText: string) {
  await fieldScope.getByRole("button").first().click();
  await page.locator(".tz-select-pop").getByRole("button", { name: optionText, exact: true }).click();
}

function fieldByLabel(scope: Locator, label: string) {
  return scope.locator(`label:text-is("${label}")`).first().locator("xpath=..");
}

test.describe("F10 — Tareas", () => {
  test("dirección crea una tarea, la reasigna, la filtra y la completa", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/tareas");

    // ---- Crear ----
    await page.getByRole("button", { name: "+ Nueva tarea" }).click();
    const drawer = page.getByRole("dialog", { name: "Nueva tarea" });
    await expect(drawer).toBeVisible();

    await drawer.locator('input[name="title"]').fill(TITLE);
    await drawer.locator('textarea[name="body"]').fill("Marca pulsaciones de más en el primer minuto.");
    await drawer.locator('input[name="category"]').fill("Instalaciones");
    await chooseInField(page, fieldByLabel(drawer, "Asignar a"), TRAINER);
    await chooseInField(page, fieldByLabel(drawer, "Prioridad"), "Alta");

    await drawer.getByRole("button", { name: "Crear tarea" }).click();
    // El cajón no se desmonta al cerrarse (se desplaza fuera de pantalla), así
    // que la confirmación de que el alta ha ido bien es el aviso, no que el
    // diálogo desaparezca del DOM.
    await expect(page.getByText("Tarea creada")).toBeVisible({ timeout: 10_000 });

    // Aparece en el tablero, pendiente y firmada por quien la manda: eso es lo
    // que distingue una tarea manual de las que levanta el motor de reglas.
    const boardCard = page.locator("[data-task-column='PENDIENTE']").filter({ hasText: TITLE });
    await expect(boardCard).toBeVisible({ timeout: 10_000 });
    await expect(boardCard).toContainText(TRAINER);
    await expect(boardCard).toContainText(`de ${DIRECTOR}`);

    // ---- Reasignar ----
    const select = page.locator(`select[aria-label="Reasignar «${TITLE}»"]`).first();
    const before = await select.inputValue();
    await select.selectOption({ label: OTHER_TRAINER });
    await expect(page.getByText("Tarea reasignada")).toBeVisible({ timeout: 10_000 });

    // El aviso sale antes de que el `router.refresh()` repinte la tarjeta: la
    // espera tiene que ser sobre el valor del control, no una lectura suelta.
    const reassigned = page.locator(`select[aria-label="Reasignar «${TITLE}»"]`).first();
    await expect(reassigned).not.toHaveValue(before, { timeout: 10_000 });
    const after = await reassigned.inputValue();

    // Cambia quién la hace, NO quién la mandó.
    await page.goto("/tareas?vista=lista");
    const row = page.locator("li").filter({ hasText: TITLE }).first();
    await expect(row).toContainText(OTHER_TRAINER);
    await expect(row).toContainText(`de ${DIRECTOR}`);

    // ---- Filtrar por entrenador y por estado ----
    await page.goto(`/tareas?vista=lista&recipientUserId=${before}`);
    await expect(page.getByText(TITLE)).toHaveCount(0);
    await page.goto(`/tareas?vista=lista&recipientUserId=${after}`);
    await expect(page.getByText(TITLE).first()).toBeVisible();
    // Está pendiente: filtrando por «en curso» no debe salir.
    await page.goto("/tareas?vista=lista&status=EN_CURSO");
    await expect(page.getByText(TITLE)).toHaveCount(0);

    // ---- Completar ----
    await page.goto("/tareas?vista=lista");
    await page.locator("li").filter({ hasText: TITLE }).first().getByRole("button", { name: "Completar" }).click();
    await expect(page.getByText("Tarea completada")).toBeVisible({ timeout: 10_000 });

    // Fuera de las vistas activas...
    await page.goto("/tareas?vista=lista");
    await expect(page.getByText(TITLE)).toHaveCount(0);
    // ...y consultable en el histórico, sin perder de quién venía.
    await page.goto("/tareas?vista=historico");
    const archived = page.locator("li").filter({ hasText: TITLE }).first();
    await expect(archived).toBeVisible({ timeout: 10_000 });
    await expect(archived).toContainText(`de ${DIRECTOR}`);
  });

  test("un entrenador ve sus tareas pero no reparte trabajo", async ({ page }) => {
    await loginAs(page, "entrenador@trainingzone.es");
    await page.goto("/tareas");

    // Puede apuntarse trabajo, pero no encargárselo a otro: sin eje «Asignada
    // a» en la barra de filtros ni selector de reasignación en las tarjetas.
    await expect(page.getByRole("button", { name: "+ Nueva tarea" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Asignada a" })).toHaveCount(0);
    await expect(page.locator("select[aria-label^='Reasignar']")).toHaveCount(0);
  });
});

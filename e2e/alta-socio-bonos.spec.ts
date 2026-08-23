import { test, expect, type Page, type Locator } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * RB-AGENDA-003: un socio puede tener varios bonos ACTIVE a la vez, de
 * distinta modalidad (EP/grupos) y en centros distintos de la misma
 * organización. Cubre el alta con más de un bono y añadir un bono más a un
 * socio ya existente desde su ficha.
 */

const CENTER_A = "TRAINING ZONE La Jota";
const CENTER_B = "TRAINING ZONE Puerta del Carmen";
const EP_PLAN = "Entrenamiento personal · Bono 8 sesiones";
const GROUP_PLAN = "Grupos reducidos · Bono 4 sesiones";

/**
 * `Select` de este repo no es un <select> nativo: es un desplegable propio
 * (botón + input oculto) — se abre con click sobre el botón del Field y se
 * elige la opción por texto en el popover (mismo patrón que productos-y-setup
 * y leads.spec.ts).
 */
async function chooseInField(page: Page, fieldScope: Locator, optionText: string) {
  await fieldScope.getByRole("button").first().click();
  await page.locator(".tz-select-pop").getByRole("button", { name: optionText, exact: true }).click();
}

function fieldByLabel(scope: Locator, label: string, nth = 0) {
  return scope.locator(`label:text-is("${label}")`).nth(nth).locator("xpath=..");
}

test.describe("Alta de socio con varios bonos (RB-AGENDA-003)", () => {
  test("dirección da de alta un socio con dos bonos en centros distintos", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/members");

    await page.getByRole("button", { name: "+ Nuevo socio" }).click();
    const drawer = page.getByRole("dialog", { name: "Nuevo socio" });
    await expect(drawer).toBeVisible();

    const email = `e2e.altabonos.${Date.now()}@example.com`;
    await drawer.locator('input[name="firstName"]').fill("Playwright");
    await drawer.locator('input[name="lastName"]').fill(`MultiBono ${Date.now()}`);
    await drawer.locator('input[name="email"]').fill(email);

    await chooseInField(page, fieldByLabel(drawer, "Centro"), CENTER_A);

    // Dos filas de bono: EP en el centro A, grupos en el centro B.
    await drawer.getByRole("button", { name: "+ Añadir bono" }).click();
    await drawer.getByRole("button", { name: "+ Añadir bono" }).click();

    await chooseInField(page, fieldByLabel(drawer, "Plan", 0), EP_PLAN);
    await chooseInField(page, fieldByLabel(drawer, "Centro del bono", 0), CENTER_A);
    await chooseInField(page, fieldByLabel(drawer, "Plan", 1), GROUP_PLAN);
    await chooseInField(page, fieldByLabel(drawer, "Centro del bono", 1), CENTER_B);

    await drawer.getByRole("button", { name: "Guardar y enviar bienvenida" }).click();
    await expect(page.getByText("Socio creado")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/members?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /Playwright MultiBono/ }).click();
    await page.getByRole("tab", { name: "Plan y pagos" }).click();

    // Una tarjeta por bono, cada una con su plan y su centro — el motivo mismo
    // de la fase. El centro va en la línea meta, hermana del título dentro de
    // la cabecera de la tarjeta.
    const epHeader = page.getByRole("heading", { name: EP_PLAN, exact: true });
    const groupHeader = page.getByRole("heading", { name: GROUP_PLAN, exact: true });
    await expect(epHeader).toBeVisible();
    await expect(groupHeader).toBeVisible();

    await expect(epHeader.locator("xpath=../..")).toContainText(CENTER_A);
    await expect(groupHeader.locator("xpath=../..")).toContainText(CENTER_B);
  });

  test("dirección añade un bono más a un socio ya existente desde su ficha", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/members");

    // Alta con un único bono, para luego añadirle un segundo desde la ficha.
    await page.getByRole("button", { name: "+ Nuevo socio" }).click();
    const drawer = page.getByRole("dialog", { name: "Nuevo socio" });
    const email = `e2e.addbono.${Date.now()}@example.com`;
    await drawer.locator('input[name="firstName"]').fill("Playwright");
    await drawer.locator('input[name="lastName"]').fill(`AddBono ${Date.now()}`);
    await drawer.locator('input[name="email"]').fill(email);
    await chooseInField(page, fieldByLabel(drawer, "Centro"), CENTER_A);
    await drawer.getByRole("button", { name: "+ Añadir bono" }).click();
    await chooseInField(page, fieldByLabel(drawer, "Plan", 0), EP_PLAN);
    await chooseInField(page, fieldByLabel(drawer, "Centro del bono", 0), CENTER_A);
    await drawer.getByRole("button", { name: "Guardar y enviar bienvenida" }).click();
    await expect(page.getByText("Socio creado")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/members?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /Playwright AddBono/ }).click();
    await page.getByRole("tab", { name: "Plan y pagos" }).click();
    await expect(page.getByRole("heading", { name: EP_PLAN, exact: true })).toBeVisible();

    // "Añadir bono": un segundo bono, de grupos, en el otro centro. El
    // formulario ya no está montado en la página: lo despliega el botón de la
    // cabecera de la sección (el primero con ese nombre; el segundo es el
    // submit del propio formulario).
    await page.getByRole("button", { name: "Añadir bono" }).first().click();
    // Se ancla por el <p> del kicker (texto exacto) y se sube a su div
    // contenedor: un filtro `hasText` sobre "div" también capturaría el propio
    // botón "Añadir bono" (mismo texto) y resolvía a un contenedor demasiado
    // estrecho, sin los selects de Plan/Centro dentro.
    const addBonoSection = page.locator("p", { hasText: "Añadir bono" }).locator("xpath=..");
    await chooseInField(page, fieldByLabel(addBonoSection, "Plan"), GROUP_PLAN);
    await chooseInField(page, fieldByLabel(addBonoSection, "Centro"), CENTER_B);
    await addBonoSection.getByRole("button", { name: "Añadir bono" }).click();

    await expect(page.getByText("Bono añadido.")).toBeVisible({ timeout: 15_000 });
    const groupHeader = page.getByRole("heading", { name: GROUP_PLAN, exact: true });
    await expect(groupHeader).toBeVisible();
    await expect(groupHeader.locator("xpath=../..")).toContainText(CENTER_B);

    // La meta del rail resume ambos bonos en vez de contar solo el primero.
    await expect(page.getByRole("tab", { name: "Plan y pagos" })).toContainText("2 bonos activos");
  });
});

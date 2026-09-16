import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
import { prisma } from "@/lib/prisma";

/**
 * E14-28 · EL EDITOR NO DEJA GUARDAR UN FLUJO INVÁLIDO.
 *
 * Y lo que de verdad se comprueba aquí no es que el formulario avise —eso es
 * cortesía— sino que NO SE ESCRIBE NADA. La validación vive en el servidor
 * (`saveFlow` → `validateFlow`), así que el test mira la base de datos después
 * de intentar guardar: si el flujo inválido no está, la garantía es real.
 *
 * Este fichero es de E2 y se llama `flujos-editor`: `e2e/flujos.spec.ts` es de
 * E3 y prueba los seis flujos de salida de punta a punta.
 */

const DIRECCION = "direccion@trainingzone.es";
/** Nombre único: la base de demo es compartida y dos pasadas no pueden chocar. */
const NOMBRE = `Flujo E2E ${Date.now().toString().slice(-6)}`;

let orgId = "";

test.beforeAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  orgId = org.id;
  // La pausa global es un estado de la organización y la demo es compartida:
  // una pasada anterior que se cayera a mitad la dejaría puesta, y entonces
  // este spec buscaría un botón «Pausar todo» que no está. Se parte siempre de
  // despausado, y se deja despausado.
  await prisma.organization.update({ where: { id: orgId }, data: { flowsPausedAt: null } });
});

test.afterAll(async () => {
  // Lo que cree este spec se lleva por delante sus pasos y condiciones en
  // cascada; el resto de la demo no se toca.
  await prisma.flow.deleteMany({ where: { orgId, name: { startsWith: "Flujo E2E " } } });
  await prisma.organization.update({ where: { id: orgId }, data: { flowsPausedAt: null } });
});

test.describe("E14-28 · el editor de cuatro piezas", () => {
  test("no deja guardar un flujo inválido, y el servidor no escribe nada", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/flujos/nuevo");

    const editor = page.getByTestId("flow-editor");
    await expect(editor).toBeVisible();

    // Un flujo recién abierto YA es inválido: no tiene nombre y su primer paso
    // es un email sin asunto ni cuerpo. El editor lo dice antes de tocar nada.
    const errores = page.getByTestId("flow-editor-errores");
    await expect(errores).toBeVisible();
    await expect(errores).toContainText("nombre");

    // Se le pone nombre pero se deja el email a medias: sigue inválido.
    await page.getByRole("textbox", { name: "Nombre" }).fill(NOMBRE);
    await expect(errores).toContainText("asunto");

    // Y aunque se fuerce el guardado, el SERVIDOR lo rechaza.
    await page.getByRole("button", { name: "Crear flujo" }).click();
    await expect(page.getByText(/asunto/i).first()).toBeVisible();

    // La prueba de verdad: no hay fila.
    const enBase = await prisma.flow.count({ where: { orgId, name: NOMBRE } });
    expect(enBase).toBe(0);
  });

  test("una rama de reacción sin email en el tronco tampoco se guarda", async ({ page }) => {
    // Es el flujo que «parece que funciona»: se guardaba, se activaba y esa
    // rama no se ejecutaba jamás porque no había ningún correo del que colgar.
    await loginAs(page, DIRECCION);
    await page.goto("/flujos/nuevo");

    await page.getByRole("textbox", { name: "Nombre" }).fill(`${NOMBRE} rama`);

    // El único paso del tronco pasa a ser «poner etiqueta»: ya no manda nada.
    // El `Select` de este repositorio es un botón con `aria-haspopup="listbox"`
    // (a propósito: `role="combobox"` prohíbe calcular el nombre accesible a
    // partir del contenido), así que se abre y se elige por rótulo.
    await page.getByLabel("Acción").first().click();
    await page.getByRole("button", { name: "Poner etiqueta", exact: true }).click();

    // Y se añade un paso en la rama «si hace clic».
    await page.getByRole("button", { name: "+ Paso" }).click();
    await page.getByLabel("Rama").nth(1).click();
    await page.getByRole("button", { name: "Si hace clic", exact: true }).click();

    await expect(page.getByTestId("flow-editor-errores")).toContainText("no se ejecuta nunca");

    await page.getByRole("button", { name: "Crear flujo" }).click();
    expect(await prisma.flow.count({ where: { orgId, name: `${NOMBRE} rama` } })).toBe(0);
  });

  test("un flujo completo sí se guarda, y nace en BORRADOR", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/flujos/nuevo");

    await page.getByRole("textbox", { name: "Nombre" }).fill(`${NOMBRE} valido`);
    await page.getByRole("textbox", { name: "Asunto" }).fill("Bienvenido a Training Zone");
    await page.getByRole("textbox", { name: "Cuerpo" }).fill("Nos alegra tenerte por aquí.");

    await expect(page.getByTestId("flow-editor-errores")).toHaveCount(0);
    await page.getByRole("button", { name: "Crear flujo" }).click();

    await page.waitForURL(/\/flujos\/[^/]+$/, { timeout: 15_000 });

    const guardado = await prisma.flow.findFirstOrThrow({
      where: { orgId, name: `${NOMBRE} valido` },
      select: { status: true, steps: { select: { branch: true, position: true, actionType: true } } },
    });
    // Nace en borrador SIEMPRE: nadie enciende sin querer un flujo que escribe
    // a socios de verdad.
    expect(guardado.status).toBe("DRAFT");
    expect(guardado.steps).toHaveLength(1);
    expect(guardado.steps[0]).toMatchObject({ branch: "MAIN", position: 0, actionType: "SEND_EMAIL" });
  });
});

test.describe("E14-27 · la pausa global se ve desde cualquier pantalla", () => {
  test("al pausar, el aviso acompaña también al editor, y lo encolado no se pierde", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/flujos");

    const encoladosAntes = await prisma.flowEnrollment.count({ where: { orgId, status: "SCHEDULED" } });

    await page.getByRole("button", { name: "Pausar todo" }).click();
    await expect(page.getByTestId("flujos-pausa")).toBeVisible();

    // La banda vive en el layout: sigue estando en una pantalla distinta.
    await page.goto("/flujos/nuevo");
    await expect(page.getByTestId("flujos-pausa")).toBeVisible();
    await expect(page.getByTestId("flujos-pausa")).toContainText("no se pierde nada");

    // Y la cola sigue intacta: pausar no descarta nada.
    expect(await prisma.flowEnrollment.count({ where: { orgId, status: "SCHEDULED" } })).toBe(encoladosAntes);

    await page.getByRole("button", { name: "Reanudar" }).click();
    await expect(page.getByTestId("flujos-pausa")).toHaveCount(0);
  });
});

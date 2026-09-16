import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
import { prisma } from "@/lib/prisma";
import { AUTOMATIC_TAG_DESCRIPTION, AUTOMATIC_TAG_LABEL } from "@/lib/tags";

/**
 * E1 · Etiquetas de socio — el catálogo, la ficha y el filtro del listado.
 *
 * El motor lo dispara el cron (`/api/jobs/run`), que en la demo no ha corrido:
 * sin una pasada previa las nueve automáticas existirían como catálogo pero no
 * las tendría ningún socio, y no habría nada que filtrar. La pasada se hace por
 * donde la haría dirección —el botón «Recalcular ahora» de `/etiquetas`, que
 * llama a la misma función que el cron— y no importando el motor aquí: este
 * proceso no es el servidor de Next y no puede cargar lo que cuelga de Auth.js.
 */

const DIRECCION = "direccion@trainingzone.es";
/** Rótulo único: la demo es compartida y dos pasadas no pueden chocar. */
const NUEVA = `Reto ${Date.now().toString().slice(-6)}`;

let orgId = "";
let delinquentMemberId = "";
let impagoCount = 0;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAs(page, DIRECCION);
  await page.goto("/etiquetas");
  await page.getByRole("button", { name: "Recalcular ahora" }).click();
  // La primera pasada pone; la segunda no mueve nada. Es la idempotencia del
  // motor vista desde fuera, y de paso asegura que la primera ha terminado.
  await expect(page.getByText(/puestas y .* retiradas|ya estaban al día/)).toBeVisible();
  await page.close();

  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  orgId = org.id;
  impagoCount = await prisma.memberTag.count({
    where: { orgId, tagDefinition: { key: "impago" } },
  });

  const member = await prisma.member.findFirstOrThrow({
    where: { orgId, state: "DELINQUENT" },
    select: { id: true },
  });
  delinquentMemberId = member.id;
});

test.describe("E14-21 · catálogo de etiquetas", () => {
  test("las nueve automáticas se ven con su definición y con cuántos socios afectan", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/etiquetas");

    // Las nueve, con el rótulo y la definición en texto llano al lado.
    for (const [key, label] of Object.entries(AUTOMATIC_TAG_LABEL)) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      await expect(
        page.getByText(AUTOMATIC_TAG_DESCRIPTION[key as keyof typeof AUTOMATIC_TAG_DESCRIPTION], { exact: true })
      ).toBeVisible();
    }

    // Y el número que dice si la regla está bien acotada: ninguna de las nueve
    // puede salir vacía. Una vacía se marca en la propia tabla con «revisar».
    await expect(page.getByText("0 · revisar")).toHaveCount(0);

    // Una automática no trae ni «Renombrar» ni «Desactivar»: de ellas manda el
    // motor. Los controles solo salen en la tabla de las manuales.
    const automaticas = page.locator("section", { hasText: "Automáticas" }).first();
    await expect(automaticas.getByRole("button", { name: "Desactivar" })).toHaveCount(0);
  });

  test("una etiqueta manual se crea, se renombra y se desactiva sin borrarse", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/etiquetas");

    await page.getByRole("textbox", { name: "Nueva etiqueta manual" }).fill(NUEVA);
    await page.getByRole("button", { name: "Crear etiqueta" }).click();
    await expect(page.getByText(NUEVA, { exact: true })).toBeVisible();

    const fila = page.locator("tr", { hasText: NUEVA });
    await expect(fila.getByText("Activa", { exact: true })).toBeVisible();

    // Renombrar cambia el rótulo, nunca la clave: las condiciones de un flujo
    // guardan la clave, así que un renombrado no puede dejarlas apuntando a nada.
    const renombrada = `${NUEVA} bis`;
    await fila.getByRole("button", { name: "Renombrar" }).click();
    await page.getByRole("textbox", { name: "Nuevo rótulo" }).fill(renombrada);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(renombrada, { exact: true })).toBeVisible();

    // Desactivar NO borra: la fila sigue ahí, con su histórico.
    const filaBis = page.locator("tr", { hasText: renombrada });
    await filaBis.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.locator("tr", { hasText: renombrada }).getByText("Desactivada", { exact: true })).toBeVisible();

    const enBase = await prisma.memberTagDefinition.findFirst({
      where: { orgId, label: renombrada },
      select: { active: true, kind: true },
    });
    expect(enBase).not.toBeNull();
    expect(enBase?.active).toBe(false);
    expect(enBase?.kind).toBe("MANUAL");
  });
});

test.describe("E14-23 · en el listado y en la ficha", () => {
  test("se filtra el listado de socios por etiqueta", async ({ page }) => {
    test.skip(impagoCount === 0, "la demo no tiene ningún socio en impago");

    await loginAs(page, DIRECCION);
    await page.goto("/members");

    await page.getByRole("button", { name: "Etiqueta" }).click();
    await page.getByRole("checkbox", { name: new RegExp(`^${AUTOMATIC_TAG_LABEL.impago}`) }).click();
    await page.keyboard.press("Escape");

    // El chip del filtro aplicado, y el recuento del pie: los socios con la
    // etiqueta, no todos.
    await expect(page.getByLabel(`Quitar filtro Etiqueta: ${AUTOMATIC_TAG_LABEL.impago}`)).toBeVisible();
    // El pie del listado SINGULARIZA (`members/page.tsx`: «1 socio en total»,
    // «2 socios en total»), así que la aserción tiene que singularizar igual.
    // Con el plural fijo, este test se caía SIEMPRE que el recuento valiera
    // exactamente 1 —y cuánta gente hay en impago en la demo depende de lo que
    // hayan hecho antes los specs de cobros, así que caía unas pasadas sí y
    // otras no. Lo que se comprueba es el número, no la gramática.
    const socios = impagoCount === 1 ? "socio" : "socios";
    await expect(page.getByText(`${impagoCount} ${socios} en total`)).toBeVisible();

    // Y son los de verdad: todos los de la página llevan la píldora de impago.
    // La tabla se busca por su columna «Socio» y no con `tbody tr` a secas:
    // desde E14-08 el listado tiene encima la card de bonos por centro, que
    // también es una <table>, y el selector suelto contaba las dos.
    const listado = page.locator("table").filter({ has: page.locator("th", { hasText: "Socio" }) });
    await expect(listado.locator("tbody tr")).toHaveCount(Math.min(impagoCount, 25));
  });

  test("la ficha enseña las etiquetas, y la automática no se puede quitar a mano", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto(`/members/${delinquentMemberId}`);

    const panel = page.getByTestId("member-tags");
    await expect(panel.getByText(AUTOMATIC_TAG_LABEL.impago, { exact: true })).toBeVisible();
    // Sin aspa: quitarla no serviría de nada, volvería en la pasada siguiente.
    await expect(panel.getByRole("button", { name: `Quitar etiqueta ${AUTOMATIC_TAG_LABEL.impago}` })).toHaveCount(0);

    // La manual sí: se pone y se quita desde aquí.
    await panel.getByRole("button", { name: "+ Etiqueta" }).click();
    await panel.getByRole("button", { name: "+ Embajador" }).click();
    await expect(panel.getByText("Embajador", { exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "Quitar etiqueta Embajador" }).click();
    await expect(panel.getByText("Embajador", { exact: true })).toHaveCount(0);
  });
});

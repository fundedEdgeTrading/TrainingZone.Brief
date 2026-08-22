import { test, expect, type Page, type Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loginAs } from "./helpers";

/**
 * Migrar a los socios que el gimnasio YA cobra es la operación con más dinero
 * en juego del producto, y la que se ejecuta varias veces: el gimnasio sube el
 * CSV, ve errores, lo corrige y lo vuelve a subir. Lo que aquí se protege no es
 * que la importación funcione una vez, sino que la segunda pasada **no duplique
 * la cuota** — un socio con dos suscripciones activas se cobra dos veces.
 */

const PLAN = "Grupos reducidos · Bono 12 sesiones";
const EMAIL = "migrado.e2e@example.com";
/** Email propio: los tests comparten base y el socio del primero seguiría vivo. */
const EMAIL_SIN_PLAN = "migrado.sinplan.e2e@example.com";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function csv() {
  return [
    "Nombre;Apellidos;Email;Plan;Cuota;Fecha de alta de la cuota;Sesiones restantes",
    // Precio histórico (85,00 €) distinto del de tarifa (102,00 €): en una
    // migración real hay socios con condiciones antiguas que hay que respetar.
    `Socio;Migrado E2E;${EMAIL};${PLAN};85,00 €;01/03/2024;5`,
  ].join("\n");
}

async function limpiar() {
  const members = await prisma.member.findMany({
    where: { email: { in: [EMAIL, EMAIL_SIN_PLAN] } },
    select: { id: true },
  });
  for (const m of members) {
    await prisma.subscription.deleteMany({ where: { memberId: m.id } });
    await prisma.member.delete({ where: { id: m.id } });
  }
}

test.beforeAll(limpiar);
test.afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

/**
 * La página monta varios drawers a la vez y todos quedan en el DOM, así que hay
 * dos `role=dialog` y dos disparadores «Seleccionar...» (uno es el filtro de la
 * tabla). Se acota al drawer que contiene el input de fichero, que es el único
 * que lo tiene. El título del drawer no es un `heading` accesible: esperar por
 * él daba un timeout que se leía como «no se abre» cuando sí se abría.
 */
async function abrirDrawer(page: Page) {
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const drawer = page.getByRole("dialog").filter({ has: page.locator("input[name=file]") });
  await expect(drawer.locator("input[name=file]")).toBeVisible({ timeout: 15_000 });
  return drawer;
}

/**
 * El Select del sistema de diseño es un combobox, no un <select> nativo.
 *
 * Al cerrar, el drawer llama a `form.reset()`, que limpia los inputs nativos
 * pero no el estado de React del combobox: en la segunda apertura el centro
 * sigue elegido y ya no hay rótulo «Seleccionar...». El valor que se envía es
 * el correcto, así que esto no se toca — el helper se limita a no dar por hecho
 * que siempre hay que elegir.
 */
async function elegirCentro(drawer: Locator) {
  const trigger = drawer.getByRole("button", { name: "Seleccionar..." });
  if ((await trigger.count()) === 0) return;
  await trigger.first().click();
  // La lista se pinta en un portal a `document.body` para que no la recorte el
  // drawer, así que se busca en la página, no dentro del drawer.
  // La opción se rotula con el prefijo de la organización («TRAINING ZONE La
  // Jota»): fijar el nombre exacto ataría el test al nombre comercial.
  await drawer.page().locator(".tz-select-pop").getByRole("button", { name: /La Jota/ }).click();
}

test.describe("Importación de socios con su cuota", () => {
  test("el CSV trae la cuota, y reimportarlo no la duplica", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/members");

    async function importar() {
      const drawer = await abrirDrawer(page);
      await elegirCentro(drawer);
      await drawer.locator("input[name=file]").setInputFiles({
        name: "socios.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv(), "utf-8"),
      });
      await drawer.getByRole("button", { name: "Importar socios" }).click();
      await expect(drawer.getByText("Cuotas dadas de alta")).toBeVisible({ timeout: 15_000 });
      return drawer;
    }

    const drawer = await importar();

    const member = await prisma.member.findFirstOrThrow({ where: { email: EMAIL } });
    const subs = await prisma.subscription.findMany({ where: { memberId: member.id } });
    expect(subs).toHaveLength(1);
    // El precio pactado gana al de tarifa: importar no puede subirle la cuota
    // al socio por su cuenta.
    expect(subs[0].priceCents).toBe(8500);
    expect(subs[0].sessionsRemaining).toBe(5);
    expect(subs[0].startDate.getFullYear()).toBe(2024);

    // Hay dos «Cerrar»: la × de la cabecera (aria-label) y el del pie.
    await drawer.getByRole("button", { name: "Cerrar", exact: true }).last().click();
    await importar();

    const trasReimportar = await prisma.subscription.findMany({ where: { memberId: member.id } });
    expect(trasReimportar, "la segunda pasada no puede crear una segunda cuota").toHaveLength(1);
    expect(await prisma.member.count({ where: { email: EMAIL } })).toBe(1);
  });

  test("un plan que no existe omite la fila en vez de dejar al socio sin cobrar", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
    await page.goto("/members");

    const drawer = await abrirDrawer(page);
    await elegirCentro(drawer);
    await drawer.locator("input[name=file]").setInputFiles({
      name: "socios.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        ["Nombre;Apellidos;Email;Plan", `Socio;Sin Plan E2E;${EMAIL_SIN_PLAN};Tarifa Que No Existe`].join("\n"),
        "utf-8"
      ),
    });
    await drawer.getByRole("button", { name: "Importar socios" }).click();

    // Importar a la persona sin su cuota la dejaría como socia activa que nadie
    // cobra: exactamente el silencio que esta importación viene a evitar.
    await expect(page.getByText(/no existe o está archivado/)).toBeVisible({ timeout: 15_000 });
    expect(await prisma.member.count({ where: { email: EMAIL_SIN_PLAN } })).toBe(0);
  });
});

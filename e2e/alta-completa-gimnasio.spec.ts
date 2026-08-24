import crypto from "crypto";
import { test, expect, type Page, type Locator, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loginAs } from "./helpers";

/**
 * Cobertura exhaustiva del recorrido completo de Parte A (Apta → gimnasio):
 * compra del plan por el futuro director → alta pago-primero por webhook
 * firmado → activación de su contraseña → puesta en marcha de la organización
 * (marca, centros hasta el límite del plan, productos, equipo repartido en
 * varios centros, socios) → estado final del checklist.
 *
 * No hay email de prueba disponible (Brevo no está configurado en este
 * entorno: `mailer.ts` solo registra el envío en el log), así que los enlaces
 * de invitación se leen directamente de Postgres, igual que en
 * `alta-comercial.spec.ts`. Sin credenciales de Stripe reales, la creación de
 * la sesión de checkout no se cubre aquí: se firma el evento del webhook con
 * el mismo secreto que lo verifica, tal y como hace ese spec.
 *
 * Cada organización de prueba usa un email fijo pero se identifica con un
 * timestamp único por ejecución, y no se borra al terminar — mismo criterio
 * que `alta-socio-bonos.spec.ts` y `productos-y-setup.spec.ts`, que tampoco
 * limpian los socios/productos que crean: es una base de datos de demo
 * desechable en un entorno efímero.
 */
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

const TAG = Date.now();
const ORG_NAME = `GIMNASIO APTA E2E COMPLETO ${TAG}`;
const OWNER_EMAIL = `director.e2e.${TAG}@gimnasio-apta-e2e.es`;
const OWNER_PASSWORD = "ApTaSegura!2026";

const CENTER_1 = `Centro Norte E2E ${TAG}`;
const CENTER_2 = `Centro Sur E2E ${TAG}`;
const CENTER_3 = `Centro Este E2E ${TAG}`;
const CENTER_4 = `Centro Oeste E2E ${TAG}`;

const DIRECTORA_EMAIL = `directora.centro.e2e.${TAG}@gimnasio-apta-e2e.es`;
const ENTRENADOR_EMAIL = `entrenador.e2e.${TAG}@gimnasio-apta-e2e.es`;
const RRHH_EMAIL = `rrhh.e2e.${TAG}@gimnasio-apta-e2e.es`;
const RRHH_PASSWORD = "RrhhSegura!2026";

const PRODUCT_NAME = `Cuota mensual E2E ${TAG}`;

function checkoutCompleted(sessionId: string, email: string, planCode: string, name: string) {
  return {
    id: `evt_${sessionId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: `cus_${sessionId}`,
        subscription: `sub_${sessionId}`,
        metadata: { planCode },
        customer_details: { email, name, tax_ids: [{ type: "es_cif", value: "B88888888" }] },
      },
    },
  };
}

async function postSigned(request: APIRequestContext, body: unknown) {
  const payload = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET!).update(`${ts}.${payload}`).digest("hex");
  return request.post("/api/stripe/webhook", {
    headers: { "content-type": "application/json", "stripe-signature": `t=${ts},v1=${signature}` },
    data: payload,
  });
}

/** El `Select` de este repo no es un <select> nativo: botón + popover. */
function fieldByLabel(scope: Locator, label: string, nth = 0) {
  return scope.locator(`label:text-is("${label}")`).nth(nth).locator("xpath=..");
}
async function chooseInField(page: Page, fieldScope: Locator, optionText: string) {
  await fieldScope.getByRole("button").first().click();
  await page.locator(".tz-select-pop").getByRole("button", { name: optionText, exact: true }).click();
}

function productForm(page: Page) {
  return page.locator("form", { has: page.getByRole("button", { name: "Crear producto" }) });
}
async function chooseProductType(page: Page, label: string) {
  const form = productForm(page);
  await form.getByRole("button", { name: /Cuota mensual|Bono de sesiones|Sesión suelta/ }).click();
  await page.locator(".tz-select-pop").getByRole("button", { name: label, exact: true }).click();
}

test.describe("Aterrizaje en la raíz", () => {
  test("un visitante anónimo aterriza en la landing de planes, no en el login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/planes$/);
    await expect(page.getByRole("heading", { name: "Elige tu plan" })).toBeVisible();
  });

  test("una persona con sesión aterriza en su panel, no en la landing comercial", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/planes/);
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("Alta pago-primero completa: compra → puesta en marcha de la organización y sus centros", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!WEBHOOK_SECRET || !DATABASE_URL, "Requiere STRIPE_WEBHOOK_SECRET y DATABASE_URL en el entorno.");

  const prisma = DATABASE_URL
    ? new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })
    : null;

  test.afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("un pago confirmado por Stripe crea la organización y, al fijar su contraseña, el director cae en la puesta en marcha", async ({
    page,
    request,
  }) => {
    const sessionId = `cs_e2e_completo_${TAG}`;
    const res = await postSigned(request, checkoutCompleted(sessionId, OWNER_EMAIL, "avanzado_ano", ORG_NAME));
    expect(res.ok()).toBeTruthy();

    const org = await prisma!.organization.findFirst({ where: { billingEmail: OWNER_EMAIL }, select: { id: true } });
    expect(org).not.toBeNull();

    const invitation = await prisma!.invitation.findFirst({
      where: { orgId: org!.id, type: "OWNER", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(invitation).not.toBeNull();

    await page.goto(`/onboarding/${invitation!.token}`);
    await expect(page.getByRole("heading", { name: /Crea tu contraseña/ })).toBeVisible();

    await page.locator('input[type="password"]').first().fill(OWNER_PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Continuar →" }).click();

    await expect(page.getByRole("heading", { name: /Todo listo/ })).toBeVisible({ timeout: 15_000 });
    // Autologin del onboarding: aterriza solo, sin pasar por /login.
    await page.waitForURL(/\/puesta-en-marcha/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /Pon en marcha tu centro/ })).toBeVisible();
  });

  test("el checklist inicial ya recoge los datos fiscales del pago y bloquea por falta de centro", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/puesta-en-marcha");

    // El NIF/razón social llegan de `customer_details` de Stripe: el paso
    // "fiscal" ya está resuelto sin que el director haya hecho nada todavía.
    await expect(page.getByText("1 de 7 completados")).toBeVisible();
    const centroItem = page.locator("li", { hasText: "Tu primer centro" });
    await expect(centroItem.getByText("Necesario", { exact: true })).toBeVisible();
  });

  test("el director crea centros hasta el límite de su plan y el siguiente se rechaza con un motivo claro", async ({
    page,
  }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    for (const name of [CENTER_1, CENTER_2, CENTER_3]) {
      const form = page.locator("form", { has: page.getByRole("button", { name: "Añadir centro" }) });
      await form.locator('input[name="name"]').fill(name);
      await form.getByRole("button", { name: "Añadir centro" }).click();
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    }

    // Avanzado incluye 3 centros (D-8: el eje de precio es el número de centros).
    const form = page.locator("form", { has: page.getByRole("button", { name: "Añadir centro" }) });
    await form.locator('input[name="name"]').fill(CENTER_4);
    await form.getByRole("button", { name: "Añadir centro" }).click();
    await expect(page.getByText("Tu plan Avanzado incluye 3 centros. Para añadir más, cambia de plan.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(CENTER_4)).toHaveCount(0);
  });

  test("dirección actualiza la marca y da de alta un producto", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    const brandForm = page.locator("form", { has: page.getByRole("button", { name: "Guardar marca" }) });
    await brandForm.locator('input[name="logoUrl"]').fill("/brand/e2e-logo.svg");
    await brandForm.getByRole("button", { name: "Guardar marca" }).click();
    await expect(page.getByText("Marca actualizada.")).toBeVisible({ timeout: 15_000 });

    const form = productForm(page);
    await form.locator('input[name="name"]').fill(PRODUCT_NAME);
    await chooseProductType(page, "Cuota mensual");
    await form.locator('input[name="priceEuros"]').fill("39,90");
    await form.getByRole("button", { name: "Crear producto" }).click();
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test("dirección da de alta personal en centros distintos y lo reparte con imputación cruzada", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    async function newStaff(name: string, email: string, role: string, center: string | null) {
      await page.getByRole("button", { name: "+ Nueva persona" }).click();
      const dialog = page.getByRole("dialog", { name: "Nueva persona" });
      await dialog.locator('input[name="name"]').fill(name);
      await dialog.locator('input[name="email"]').fill(email);
      await chooseInField(page, fieldByLabel(dialog, "Rol"), role);
      await chooseInField(page, fieldByLabel(dialog, "Centro base"), center ?? "— (organización) —");
      await dialog.getByRole("button", { name: "Guardar y enviar invitación" }).click();
      await expect(page.getByText("Persona creada")).toBeVisible({ timeout: 15_000 });
    }

    await newStaff("Directora Centro Sur E2E", DIRECTORA_EMAIL, "Dirección de centro", CENTER_2);
    await newStaff("Entrenador Volante E2E", ENTRENADOR_EMAIL, "Entrenador", CENTER_1);

    const staffTable = page.locator("table", { hasText: "Directora Centro Sur E2E" }).first();
    await expect(staffTable.getByText("Directora Centro Sur E2E")).toBeVisible();
    await expect(staffTable.getByText("Entrenador Volante E2E")).toBeVisible();

    // Imputación cruzada: el entrenador se reparte entre su centro base y un tercero.
    const assignForm = page.locator("form", { has: page.getByRole("button", { name: "Imputar a centro" }) });
    await chooseInField(page, fieldByLabel(assignForm, "Persona"), "Entrenador Volante E2E · Entrenador");
    await chooseInField(page, fieldByLabel(assignForm, "Centro"), CENTER_3);
    await assignForm.locator('input[name="allocationPct"]').fill("50");
    await assignForm.getByRole("button", { name: "Imputar a centro" }).click();
    await expect(page.getByText("Imputación guardada.")).toBeVisible({ timeout: 15_000 });

    const trainerRow = page.locator("tr", { hasText: "Entrenador Volante E2E" });
    await expect(trainerRow.getByText(CENTER_1)).toBeVisible();
    await expect(trainerRow.getByText(CENTER_3)).toBeVisible();
    await expect(trainerRow.getByText("50%")).toBeVisible();
  });

  test("un email de personal repetido en la organización se rechaza", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    await page.getByRole("button", { name: "+ Nueva persona" }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva persona" });
    await dialog.locator('input[name="name"]').fill("Duplicado E2E");
    await dialog.locator('input[name="email"]').fill(DIRECTORA_EMAIL);
    await chooseInField(page, fieldByLabel(dialog, "Rol"), "Recepción");
    await chooseInField(page, fieldByLabel(dialog, "Centro base"), CENTER_1);
    await dialog.getByRole("button", { name: "Guardar y enviar invitación" }).click();
    await expect(page.getByText("Ya existe una persona con ese email en tu organización.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("un rol de centro sin centro base se rechaza", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");

    await page.getByRole("button", { name: "+ Nueva persona" }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva persona" });
    await dialog.locator('input[name="name"]').fill("Sin Centro E2E");
    await dialog.locator('input[name="email"]').fill(`sin.centro.${TAG}@gimnasio-apta-e2e.es`);
    await chooseInField(page, fieldByLabel(dialog, "Rol"), "Entrenador");
    await chooseInField(page, fieldByLabel(dialog, "Centro base"), "— (organización) —");
    await dialog.getByRole("button", { name: "Guardar y enviar invitación" }).click();
    await expect(page.getByText("Este rol necesita un centro base.")).toBeVisible({ timeout: 15_000 });
  });

  test("dirección da de alta un socio con un bono y el checklist ya solo espera Stripe", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/members");

    await page.getByRole("button", { name: "+ Nuevo socio" }).click();
    const drawer = page.getByRole("dialog", { name: "Nuevo socio" });
    const email = `socio.e2e.${TAG}@gimnasio-apta-e2e.es`;
    await drawer.locator('input[name="firstName"]').fill("Playwright");
    await drawer.locator('input[name="lastName"]').fill(`Completo ${TAG}`);
    await drawer.locator('input[name="email"]').fill(email);
    await chooseInField(page, fieldByLabel(drawer, "Centro"), CENTER_1);
    await drawer.getByRole("button", { name: "+ Añadir bono" }).click();
    await chooseInField(page, fieldByLabel(drawer, "Plan", 0), PRODUCT_NAME);
    await chooseInField(page, fieldByLabel(drawer, "Centro del bono", 0), CENTER_1);
    await drawer.getByRole("button", { name: "Guardar y enviar bienvenida" }).click();
    await expect(page.getByText("Socio creado")).toBeVisible({ timeout: 15_000 });

    await page.goto("/puesta-en-marcha");
    await expect(page.getByText("6 de 7 completados")).toBeVisible();
    // Sin credenciales de Stripe Connect en este entorno, el único paso que queda es conectar cobros.
    const stripeItem = page.locator("li", { hasText: "Conectar Stripe" });
    await expect(stripeItem).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pon en marcha tu centro" })).toBeVisible();
  });

  test("RRHH no administra la organización: sin sección de marca ni opción para crear Dirección", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/organization");
    await page.getByRole("button", { name: "+ Nueva persona" }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva persona" });
    await dialog.locator('input[name="name"]').fill("Rita RRHH E2E");
    await dialog.locator('input[name="email"]').fill(RRHH_EMAIL);
    await chooseInField(page, fieldByLabel(dialog, "Rol"), "RRHH");
    await chooseInField(page, fieldByLabel(dialog, "Centro base"), "— (organización) —");
    await dialog.getByRole("button", { name: "Guardar y enviar invitación" }).click();
    await expect(page.getByText("Persona creada")).toBeVisible({ timeout: 15_000 });

    const invitation = await prisma!.invitation.findFirst({
      where: { email: RRHH_EMAIL, type: "STAFF", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(invitation).not.toBeNull();

    await page.goto(`/onboarding/${invitation!.token}`);
    await page.locator('input[type="password"]').first().fill(RRHH_PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(RRHH_PASSWORD);
    await page.getByRole("button", { name: "Continuar →" }).click();
    await expect(page.getByRole("heading", { name: /Todo listo/ })).toBeVisible({ timeout: 15_000 });

    await loginAs(page, RRHH_EMAIL, RRHH_PASSWORD);
    await page.goto("/organization");

    await expect(page.getByRole("heading", { name: "Marca" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Centros" })).toBeVisible();

    await page.getByRole("button", { name: "+ Nueva persona" }).click();
    const staffDialog = page.getByRole("dialog", { name: "Nueva persona" });
    await fieldByLabel(staffDialog, "Rol").getByRole("button").first().click();
    await expect(page.locator(".tz-select-pop").getByRole("button", { name: "RRHH" })).toBeVisible();
    await expect(page.locator(".tz-select-pop").getByRole("button", { name: "Dirección de organización" })).toHaveCount(0);
  });
});

import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs } from "./helpers";

/**
 * R1 · El camino entero de un referido, tal y como ocurre de verdad:
 *
 *   enlace del socio → lead con canal «Referido» → conversión → cobro → ALTA
 *   → recompensa pendiente + TAREA a administración
 *
 * Y lo que NO ocurre, que es la regla que manda sobre todas las demás: al
 * final del recorrido no se ha tocado ningún recibo que no haya registrado una
 * persona, ni se ha creado ningún cupón de Stripe. La recompensa se queda
 * esperando a que alguien la valide.
 *
 * Una sola pasada de principio a fin, en un `describe.serial`: son pasos de un
 * mismo recorrido, no pruebas independientes, y partirlos obligaría a sembrar
 * tres veces el mismo lead en la base de datos de demo.
 */

const DIRECCION = "direccion@trainingzone.es";
/** La demo es compartida: teléfono único por pasada para no chocar. */
const PHONE = `6${Date.now().toString().slice(-8)}`;
const FIRST_NAME = `Refe${Date.now().toString().slice(-5)}`;
const FULL_NAME = `${FIRST_NAME} Invitado`;

let referrerId = "";
let referrerFirstName = "";
let centerName = "";
let referralCode = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const member = await prisma.member.findFirstOrThrow({
    where: { state: "ACTIVE", primaryCenter: { slug: "la-jota" } },
    select: { id: true, firstName: true, lastName: true, primaryCenter: { select: { name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  referrerId = member.id;
  referrerFirstName = member.firstName;
  centerName = member.primaryCenter.name;
});

test.describe("R1 · referidos con recompensa, de punta a punta", () => {
  test("dirección enciende el programa del centro: importe fijo y algo para quien entra", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/referidos");

    // La pantalla dice desde el principio lo que el sistema NO va a hacer solo.
    await expect(page.getByText(/la recompensa NO se aplica sola/i).first()).toBeVisible();

    // La tarjeta del programa de ESE centro: el `div.rounded-card` que contiene
    // su encabezado. Sin acotar por la clase, `has:` devuelve también los
    // envoltorios de dentro, que no llevan el formulario.
    const card = page
      .locator("div.rounded-card")
      .filter({ has: page.getByRole("heading", { name: centerName, exact: true }) })
      .first();
    const activo = card.getByLabel("Programa activo").or(card.locator('input[type="checkbox"]').first());
    if (!(await activo.isChecked())) await activo.check();

    // A doble cara: funciona mejor, y es lo que pide la historia. Al encenderlo
    // aparece el segundo importe, y sin él «Guardar» sigue deshabilitado — que
    // es exactamente lo que tiene que pasar.
    const dobleBox = card.locator('input[type="checkbox"]').nth(1);
    if (!(await dobleBox.isChecked())) await card.getByText("Y algo para quien entra").click();

    const guardar = card.getByRole("button", { name: "Guardar" });
    await card.getByLabel("Importe (€)").first().fill("20");
    await card.getByLabel("Importe (€)").nth(1).fill("");
    await expect(guardar).toBeDisabled();
    await card.getByLabel("Importe (€)").nth(1).fill("15");
    await expect(guardar).toBeEnabled();

    await guardar.click();
    await expect(page.getByText("Programa guardado.")).toBeVisible({ timeout: 10_000 });
  });

  test("el socio tiene su enlace en la ficha, y es el mismo que usará la app", async ({ page }) => {
    await loginAs(page, DIRECCION);
    referralCode = await ensureCodeFromFicha(page, referrerId);
    expect(referralCode).toMatch(/^[A-Z0-9-]{5,}$/);
  });

  test("quien entra por el enlace cae en LEADS con canal Referido y sigue el embudo normal", async ({ page }) => {
    // Sin sesión: es una ruta pública y tiene que abrirse sin rebotar a /login.
    await page.goto(`/r/${referralCode}`);
    await expect(page.getByText(new RegExp(`${referrerFirstName} te invita`, "i"))).toBeVisible();
    // No pregunta «¿cómo nos has conocido?»: por definición lo sabemos.
    await expect(page.getByText("¿Cómo nos has conocido?")).toHaveCount(0);

    await page.locator('input[name="firstName"]').fill(FIRST_NAME);
    await page.locator('input[name="lastName"]').fill("Invitado");
    await page.locator('input[name="phone"]').fill(PHONE);
    await page.locator('input[name="email"]').fill(`${PHONE}@ejemplo.test`);
    await page.locator('input[name="birthDate"]').fill("1992-04-11");
    await page.locator('input[name="postalCode"]').fill("50014");
    await page.locator('input[name="occupation"]').fill("QA");
    await page.locator('textarea[name="goals"]').fill("Ponerme en forma con mi amiga");
    await page.getByRole("button", { name: "Pedir mi valoración" }).click();
    await expect(page.getByText("¡Gracias!")).toBeVisible({ timeout: 15_000 });

    // Y cae en el embudo que YA existe, con su canal y su embajador.
    await loginAs(page, DIRECCION);
    await page.goto(`/leads?q=${PHONE}`);
    await expect(page.getByText(FULL_NAME).first()).toBeVisible();

    const lead = await prisma.lead.findFirstOrThrow({
      where: { phone: PHONE },
      select: { channel: true, referredByMemberId: true, referralCodeId: true, status: true },
    });
    expect(lead.channel).toBe("Referido");
    expect(lead.referredByMemberId).not.toBeNull();
    expect(lead.referralCodeId).not.toBeNull();
    expect(lead.status).toBe("SIN_CONTACTAR");
  });

  test("la conversión y el cobro lo convierten en ALTA, y el alta libera la tarea", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto(`/leads?q=${PHONE}`);
    await page.getByText(FULL_NAME).first().click();
    await page.getByRole("button", { name: /Cerrar como Embudo/ }).click();
    await expect(page.getByText(/Alta iniciada/)).toBeVisible({ timeout: 15_000 });

    // Hasta aquí NO hay recompensa: el alta está en curso y todavía se puede
    // caer (`revertLeadClosureForFailedPayment` existe por eso).
    const lead = await prisma.lead.findFirstOrThrow({ where: { phone: PHONE }, select: { id: true } });
    expect(await prisma.referralReward.count({ where: { leadId: lead.id } })).toBe(0);

    // El cobro en mostrador es lo que cierra el lead (`confirmLeadClosureForMember`).
    await page.goto("/billing");
    await page.getByRole("button", { name: "Seleccionar..." }).first().click();
    await page.locator(".tz-select-pop button", { hasText: FULL_NAME }).first().click();
    await page.locator('input[name="amount"]').fill("60");
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(page.getByText("Cobro registrado.")).toBeVisible({ timeout: 15_000 });

    const rewards = await prisma.referralReward.findMany({
      where: { leadId: lead.id },
      select: { status: true, beneficiary: true, amountCents: true, notificationId: true },
    });
    expect(rewards.length).toBe(2);
    expect(rewards.every((r) => r.status === "PENDING_VALIDATION")).toBe(true);
    expect(rewards.every((r) => r.notificationId !== null)).toBe(true);

    // LA TAREA a administración, que es lo único que «libera» la recompensa.
    const tasks = await prisma.notification.findMany({
      where: { id: { in: rewards.map((r) => r.notificationId as string) } },
      select: { kind: true, entityType: true, resolvedAt: true, recipient: { select: { role: true } } },
    });
    expect(tasks.length).toBe(2);
    for (const task of tasks) {
      expect(task.kind).toBe("TASK");
      expect(task.entityType).toBe("ReferralReward");
      expect(task.resolvedAt).toBeNull();
      // A administración: recepción del centro, o dirección si no la hay.
      expect(["RECEPTION", "CENTER_DIRECTOR", "OWNER"]).toContain(task.recipient.role);
    }
  });

  test("la recompensa espera en /referidos, y validarla y pagarla no mueve un euro", async ({ page }) => {
    await loginAs(page, DIRECCION);
    await page.goto("/referidos");
    // Hay DOS filas del mismo referido —quien trae y quien entra—, así que se
    // acota por la cara: si no, `.first()` cambia de fila al reordenarse la
    // tabla por estado y el segundo clic cae en la recompensa equivocada.
    const rowOf = (side: string) => page.locator("tr").filter({ hasText: FULL_NAME }).filter({ hasText: side }).first();

    await expect(rowOf("quien trae")).toBeVisible();
    await expect(rowOf("quien trae").getByText("Pendiente de validar")).toBeVisible();

    const lead = await prisma.lead.findFirstOrThrow({ where: { phone: PHONE }, select: { id: true, convertedMemberId: true } });
    const paymentsBefore = await prisma.payment.count({ where: { memberId: lead.convertedMemberId! } });

    await rowOf("quien trae").getByRole("button", { name: "Validar" }).click();
    await expect(rowOf("quien trae").getByText("Validada")).toBeVisible({ timeout: 15_000 });

    await rowOf("quien trae").getByRole("button", { name: "Marcar pagada" }).click();
    await expect(rowOf("quien trae").getByText("Pagada")).toBeVisible({ timeout: 15_000 });

    const paid = await prisma.referralReward.findFirstOrThrow({
      where: { leadId: lead.id, beneficiary: "REFERRER" },
      select: { status: true, paidByUserId: true, paidAt: true },
    });
    expect(paid.status).toBe("PAID");
    expect(paid.paidByUserId).not.toBeNull();
    expect(paid.paidAt).not.toBeNull();

    // LA REGLA QUE MANDA: el sistema no ha tocado un recibo por su cuenta. El
    // único cobro del socio sigue siendo el que registró una persona.
    expect(await prisma.payment.count({ where: { memberId: lead.convertedMemberId! } })).toBe(paymentsBefore);
  });
});

/** El enlace del socio desde su ficha: lo crea si no lo tiene, y lo lee. */
async function ensureCodeFromFicha(page: Page, memberId: string): Promise<string> {
  await page.goto(`/members/${memberId}`);
  await expect(page.getByText(/ENLACE PARA TRAER A UN AMIGO/i)).toBeVisible();

  const crear = page.getByRole("button", { name: "Crear enlace" });
  if (await crear.isVisible().catch(() => false)) {
    await crear.click();
    await expect(page.getByText("Enlace creado. Ya se puede compartir.")).toBeVisible({ timeout: 15_000 });
  }
  const link = await page.locator("code", { hasText: "/r/" }).first().innerText();
  return link.split("/r/")[1].trim();
}

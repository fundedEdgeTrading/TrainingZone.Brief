import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
import { prisma } from "@/lib/prisma";

/**
 * M5 · el camino entero: recepción manda el formulario → la persona lo rellena
 * SIN sesión iniciada → lo respondido aparece en su ficha (E14-18/19/20).
 *
 * Es el recorrido donde vive el riesgo de esta pista: cada mitad por separado
 * ya funcionaba —el cuestionario en el portal, el token en `invitations.ts`— y
 * lo que puede romperse es la costura entre las dos.
 */

const SOCIA = { firstName: "Formularia", lastName: "Deprueba", email: "formulario.e2e@trainingzone.es" };

/**
 * Socio propio, no uno del seed: este spec comparte la organización de demo con
 * el resto, y rellenarle la valoración inicial a un socio de otro test cambiaría
 * lo que ese test ve.
 */
async function socioDePrueba() {
  const org = await prisma.organization.findFirstOrThrow({ where: { slug: "training-zone" }, select: { id: true } });
  const center = await prisma.center.findFirstOrThrow({ where: { orgId: org.id }, select: { id: true } });

  const existing = await prisma.member.findFirst({ where: { orgId: org.id, email: SOCIA.email }, select: { id: true } });
  if (existing) return { orgId: org.id, memberId: existing.id };

  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: SOCIA.firstName,
      lastName: SOCIA.lastName,
      email: SOCIA.email,
      state: "ACTIVE",
    },
    select: { id: true },
  });
  return { orgId: org.id, memberId: member.id };
}

test.afterAll(async () => {
  const member = await prisma.member.findFirst({ where: { email: SOCIA.email }, select: { id: true, orgId: true } });
  if (!member) return;
  await prisma.memberFormInvite.deleteMany({ where: { memberId: member.id } });
  await prisma.notification.deleteMany({ where: { entityType: "Member", entityId: member.id } });
  await prisma.auditLog.deleteMany({ where: { memberId: member.id } });
  await prisma.assessment.deleteMany({ where: { memberId: member.id } });
  await prisma.member.delete({ where: { id: member.id } });
});

test("enviar el formulario, rellenarlo sin sesión y encontrarlo en la ficha", async ({ page, browser }) => {
  const { memberId } = await socioDePrueba();

  // 1 · Recepción lo manda desde la ficha. No hace falta ser entrenador: es
  // justamente quien hoy lo teclea a mano (E14-18).
  await loginAs(page, "recepcion.lajota@trainingzone.es");
  await page.goto(`/members/${memberId}`);
  await expect(page.getByText("Formulario de alta")).toBeVisible();
  await expect(page.getByText("Sin enviar")).toBeVisible();

  await page.getByRole("button", { name: "Enviar formulario" }).click();
  await expect(page.getByText("Formulario enviado por correo.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Enviado", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 2 · El enlace que ha salido por correo. Se lee de la base porque el token
  // no se enseña en ninguna parte de la app, que es justamente el punto.
  const invite = await prisma.memberFormInvite.findFirstOrThrow({
    where: { memberId },
    orderBy: { sentAt: "desc" },
    select: { token: true },
  });
  // La URL no habla: ni el id del socio ni nada suyo viaja en ella.
  expect(invite.token).not.toContain(memberId);

  // 3 · Se rellena SIN sesión iniciada, en un contexto limpio.
  const anonimo = await browser.newContext();
  const publica = await anonimo.newPage();
  await publica.goto(`/formulario/${invite.token}`);

  await expect(publica.getByRole("heading", { name: `¡Hola, ${SOCIA.firstName}!` })).toBeVisible();
  // E10-01 · la capa informativa del art. 13 está ANTES del primer campo.
  await expect(publica.getByText(/responsable del tratamiento/i)).toBeVisible();
  await expect(publica.getByRole("link", { name: /Política de privacidad/i })).toBeVisible();

  await publica.locator('input[name="birthDate"]').fill("1991-04-10");
  // `exact`: sin él, "Edad" casa también con el rótulo del consentimiento
  // comercial ("nov-EDAD-es"), que es otro control de la misma página.
  await publica.getByRole("spinbutton", { name: "Edad", exact: true }).fill("34");
  await publica.getByRole("spinbutton", { name: "Altura en centímetros" }).fill("168");
  await publica.getByRole("textbox", { name: "Tu objetivo principal" }).fill("Volver a correr 10 km sin dolor de rodilla");
  await publica.getByRole("spinbutton", { name: "Peso en kilos" }).fill("71.5");
  await publica.getByRole("spinbutton", { name: "Dolor ahora mismo, de 0 a 10" }).fill("2");

  // E14-19 · el de salud es obligatorio y nunca nace marcado; el comercial va
  // aparte, es opcional y tampoco nace marcado.
  const salud = publica.locator("label", { hasText: "Datos de salud" }).locator('input[type="checkbox"]');
  const comercial = publica.locator("label", { hasText: "Comunicaciones comerciales" }).locator('input[type="checkbox"]');
  await expect(salud).not.toBeChecked();
  await expect(comercial).not.toBeChecked();

  // Sin el de salud, el botón no deja enviar.
  await expect(publica.getByRole("button", { name: /Enviar mi formulario/ })).toBeDisabled();
  await salud.check();
  await comercial.check();

  await publica.getByRole("button", { name: /Enviar mi formulario/ }).click();
  await expect(publica.getByText("¡Gracias!")).toBeVisible({ timeout: 15_000 });

  // El enlace es de un solo uso: volver a abrirlo ya no sirve.
  await publica.goto(`/formulario/${invite.token}`);
  await expect(publica.getByText("Enlace no disponible")).toBeVisible();
  await anonimo.close();

  // 4 · Y está en la ficha, sin que nadie teclee nada.
  await page.goto(`/members/${memberId}`);
  await expect(page.getByText("Relleno", { exact: true })).toBeVisible({ timeout: 15_000 });

  const assessment = await prisma.assessment.findFirstOrThrow({
    where: { memberId, kind: "INITIAL" },
    select: { answers: true, memberPartAt: true, completedAt: true },
  });
  expect(assessment.memberPartAt).not.toBeNull();
  // Sigue abierta: el screening, el PAR-Q y las marcas los añade el entrenador
  // con el socio delante (F3 §4.2).
  expect(assessment.completedAt).toBeNull();
  const answers = assessment.answers as Record<string, unknown>;
  expect((answers.perfil as Record<string, unknown>).objetivoPrincipal).toContain("10 km");

  const socia = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  expect(socia.consentHealth).toBe(true);
  expect(socia.consentHealthAt).not.toBeNull();
  expect(socia.consentMarketing).toBe(true);
  expect(socia.consentMarketingAt).not.toBeNull();
});

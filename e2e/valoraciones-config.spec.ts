import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
import { prisma } from "@/lib/prisma";

/**
 * F-VAL — la periodicidad y el cuestionario de las valoraciones son de cada
 * centro.
 *
 * Lo que se comprueba aquí es el recorrido entero, que es donde vive el riesgo:
 * lo que dirección configura en Organización tiene que aparecer —y desaparecer—
 * en el formulario que rellena el entrenador, y lo contestado a una pregunta
 * propia tiene que quedar guardado en la valoración del socio.
 */

const CONFIG_URL = "/organization/valoraciones";
const PREGUNTA = "¿Cuántos cafés al día?";

/** Socio de demo sobre el que se rellena la valoración del hito nuevo. */
async function demoMember() {
  return prisma.member.findFirstOrThrow({
    where: { user: { email: "socio@trainingzone.es" } },
    select: { id: true, orgId: true },
  });
}

/**
 * El centro se queda como estaba: esta suite comparte la organización de demo
 * con el resto de specs, y una pregunta apagada aquí cambiaría el formulario
 * que rellenan los demás. Se borra solo lo de ESTA organización.
 */
test.afterAll(async () => {
  const { orgId } = await demoMember();
  await prisma.assessmentCustomQuestion.deleteMany({ where: { orgId } });
  await prisma.assessmentQuestionToggle.deleteMany({ where: { orgId } });
  await prisma.assessment.deleteMany({ where: { orgId, kind: "CUSTOM" } });
  await prisma.assessmentMilestone.deleteMany({ where: { orgId } });
});

test("dirección configura hitos y preguntas, y el formulario del entrenador obedece", async ({ page }) => {
  await loginAs(page, "direccion@trainingzone.es");
  await page.goto(CONFIG_URL);

  // Un hito más allá del aniversario.
  const nuevoHito = page.locator("form", { hasText: "Nuevo hito" });
  await nuevoHito.locator('input[name="label"]').fill("Revisión de los 18 meses");
  await nuevoHito.locator('input[name="months"]').fill("18");
  await nuevoHito.getByRole("button", { name: "Añadir hito" }).click();
  await expect(page.locator('input[value="Revisión de los 18 meses"]')).toBeVisible();

  // Una pregunta del cuestionario estándar que este centro no hace.
  await page.getByRole("button", { name: "Quitar Estrés (1-5)" }).click();
  await expect(page.getByRole("button", { name: "Añadir Estrés (1-5)" })).toBeVisible();

  // Y una pregunta propia. El `Select` del sistema de diseño no es un <select>
  // nativo: es botón + popover, y las opciones son botones (ver productos-y-setup).
  const nuevaPregunta = page.locator("form", { has: page.getByRole("button", { name: "Añadir pregunta" }) });
  await nuevaPregunta.locator('input[name="label"]').fill(PREGUNTA);
  await nuevaPregunta.getByRole("button", { name: "Texto libre" }).click();
  await page.locator(".tz-select-pop").getByRole("button", { name: "Número", exact: true }).click();
  await nuevaPregunta.getByRole("button", { name: "Añadir pregunta" }).click();
  await expect(page.getByText(PREGUNTA)).toBeVisible();

  // El hito nuevo se puede abrir desde la ficha del socio, con su nombre.
  const member = await demoMember();
  await page.goto(`/members/${member.id}/valoraciones`);
  await page.getByRole("button", { name: "Revisión de los 18 meses" }).click();
  await page.waitForURL(/\/valoraciones\/[^/]+$/);

  // El formulario ya no pregunta el estrés y sí la pregunta del centro.
  await expect(page.getByText("Estrés (1-5)")).toHaveCount(0);
  await expect(page.getByText("Preguntas del centro")).toBeVisible();
  const cafes = page.locator("div", { hasText: PREGUNTA }).last().locator("input");
  await cafes.fill("3");

  await page.locator('input[type="number"]').first().fill("70"); // peso
  await page.getByRole("button", { name: "Guardar valoración" }).click();
  await expect(page.getByText("Valoración guardada.")).toBeVisible();

  // Y la respuesta queda en la valoración, con el nombre del hito del centro.
  await expect(page.getByRole("heading", { name: /Revisión de los 18 meses/ })).toBeVisible();
  // Ya cerrada: el formulario ha desaparecido, así que la pregunta que se lee
  // aquí es la respuesta guardada, no el campo que se acaba de rellenar.
  await expect(page.getByText(/Completada el/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Preguntas del centro")).toBeVisible();
  await expect(page.getByText(PREGUNTA)).toBeVisible();

  // Y está guardada de verdad, no solo pintada: es lo que leerá la ficha dentro
  // de un año, cuando esta pregunta ya no se haga.
  const guardada = await prisma.assessment.findFirstOrThrow({
    where: { memberId: member.id, kind: "CUSTOM" },
    select: { milestoneKey: true, answers: true },
  });
  assertCustomAnswer(guardada.answers, 3);
  expect(guardada.milestoneKey).toBe("M18");
});

/** La respuesta a una pregunta propia vive en `answers.custom[clave]`. */
function assertCustomAnswer(answers: unknown, expected: number) {
  const custom = (answers as { custom?: Record<string, unknown> }).custom ?? {};
  expect(Object.values(custom)).toContain(expected);
}

import type { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/**
 * Día ISO a `offset` días de hoy, saltando el domingo.
 *
 * La agenda del entrenador solo pinta de lunes a sábado (VISIBLE_DAYS en
 * agenda-utils.ts, desde el rediseño de la rejilla), así que una sesión creada
 * en domingo existe en la base de datos pero no tiene tarjeta que clicar. Sin
 * este salto, los tests que crean sesiones a N días vista fallaban o no según
 * el día de la semana en que se ejecutara la suite.
 */
export function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo → lunes
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

import type { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  // `waitForURL` vuelve en cuanto el App Router cambia la URL, con el destino
  // todavía sin pintar: en ese instante el `main` aún no existe. Quien llamara
  // y navegase acto seguido lanzaba una segunda navegación sobre la primera en
  // vuelo, y en una máquina lenta ambos árboles convivían en el DOM el tiempo
  // suficiente para que un locator encontrase dos veces el mismo texto.
  await page.locator("main").first().waitFor({ state: "visible", timeout: 15_000 });
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

/**
 * Cierra los dos avisos de entrada del portal (F4 §5.3 y F5 §6.3) si están.
 *
 * Con el cron diario de F4 encendido, cualquier socio acaba teniendo una
 * valoración vencida, y su aviso tapa el portal entero: sin esto, la suite se
 * cae sola con el paso de los días en vez de por un fallo real. Ambos avisos
 * son opcionales a propósito — no se espera por ellos, se descartan si están.
 */
export async function dismissPortalGates(page: Page) {
  const greeting = page.getByRole("button", { name: "¡Gracias!" });
  if (await greeting.isVisible().catch(() => false)) await greeting.click();

  const gate = page.getByRole("button", { name: "Ahora no, seguir a mi portal" });
  if (await gate.isVisible().catch(() => false)) await gate.click();
}

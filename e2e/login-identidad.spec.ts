import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F1 — Identidad global y membresías por organización", () => {
  test("una identidad con una sola membresía entra directa, sin selector", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");

    // RB-ID-002: con una única membresía no debe aparecer ningún paso intermedio.
    await expect(page.getByRole("heading", { name: "¿Dónde quieres entrar?" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("las credenciales incorrectas no revelan si el email existe", async ({ page }) => {
    // RB-ID-005: mismo mensaje para contraseña mala y para email inexistente.
    async function messageFor(email: string, password: string) {
      await page.goto("/login");
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      return page.getByText("Credenciales incorrectas.").textContent({ timeout: 15_000 });
    }

    const wrongPassword = await messageFor("sergio@trainingzone.es", "definitivamente-incorrecta");
    const unknownEmail = await messageFor("no-existe-en-apta@ejemplo.com", "demo1234");

    expect(wrongPassword).toBe(unknownEmail);
    await expect(page).toHaveURL(/\/login/);
  });

  test("el formulario de recuperación no confirma si la cuenta existe", async ({ page }) => {
    await page.goto("/recuperar-clave");
    await page.locator('input[type="email"]').fill("no-existe-en-apta@ejemplo.com");
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();

    // RB-ID-005: acuse genérico ("si hay una cuenta...") tanto si existe como si no.
    await expect(page.getByText(/Si hay una cuenta con ese email/)).toBeVisible({ timeout: 15_000 });
  });

  test("un enlace de recuperación inválido se rechaza con un mensaje claro", async ({ page }) => {
    await page.goto("/recuperar-clave/token-invalido");
    await page.locator('input[type="password"]').first().fill("nuevaclave123");
    await page.locator('input[type="password"]').nth(1).fill("nuevaclave123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();

    await expect(page.getByText("Este enlace no es válido.")).toBeVisible({ timeout: 15_000 });
  });

  test("el enlace de recuperación es alcanzable sin sesión desde el login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "He olvidado mi contraseña" }).click();
    await expect(page.getByRole("heading", { name: "Recuperar acceso" })).toBeVisible();
  });
});

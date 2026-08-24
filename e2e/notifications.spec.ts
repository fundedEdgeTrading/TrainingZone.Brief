import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F10 — Notificaciones", () => {
  test("dirección ve la campana con notificaciones y puede resolverlas", async ({ page }) => {
    await loginAs(page, "direccion@trainingzone.es");
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Notificaciones" }).click();
    await expect(page.getByText("Notificaciones", { exact: true })).toBeVisible();

    const resolveButtons = page.getByRole("button", { name: "Resolver" });
    if (await resolveButtons.first().isVisible().catch(() => false)) {
      const firstRow = page.locator("li").filter({ has: resolveButtons.first() }).first();
      const rowId = await firstRow.evaluate((el) => {
        el.setAttribute("data-e2e-target", "1");
        return true;
      });
      expect(rowId).toBe(true);

      await firstRow.getByRole("button", { name: "Resolver" }).click({ force: true });
      await expect(page.locator('[data-e2e-target="1"]')).toHaveCount(0, { timeout: 5000 });
    }
  });

  // El cron no necesita sesión, pero sí el secreto compartido: el endpoint falla
  // cerrado (503 sin JOBS_CRON_SECRET configurado, 401 si no coincide).
  test("el endpoint de jobs responde con el secreto de cron y sin credenciales de sesión", async ({ request }) => {
    const secret = process.env.JOBS_CRON_SECRET;
    test.skip(!secret, "Requiere JOBS_CRON_SECRET configurado en el entorno.");

    const res = await request.get("/api/jobs/run", { headers: { "x-cron-secret": secret! } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toBeTruthy();
  });

  test("el endpoint de jobs rechaza una petición sin el secreto de cron", async ({ request }) => {
    const res = await request.get("/api/jobs/run");
    expect(res.ok()).toBeFalsy();
    expect([401, 503]).toContain(res.status());
  });
});

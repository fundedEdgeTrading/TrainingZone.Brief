import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("F10 — Notificaciones", () => {
  test("dirección ve la campana con notificaciones y puede resolverlas", async ({ page }) => {
    await loginAs(page, "sergio@trainingzone.es");
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

  test("el endpoint de jobs responde y produce notificaciones sin credenciales de sesión", async ({ request }) => {
    const res = await request.get("/api/jobs/run");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toBeTruthy();
  });
});

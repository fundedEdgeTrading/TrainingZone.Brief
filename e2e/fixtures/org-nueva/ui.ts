import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Helpers de formulario copiados de `alta-completa-gimnasio.spec.ts` (no se
 * importan de otro spec: un spec no es una biblioteca y moverlo lo rompería
 * aquí sin avisar).
 *
 * El `Select` del sistema de diseño no es un <select> nativo: es un botón que
 * abre un popover `.tz-select-pop`. El campo se localiza por el texto exacto de
 * su etiqueta y se sube al contenedor de `Field`.
 */
export function fieldByLabel(scope: Locator | Page, label: string, nth = 0) {
  return scope.locator(`label:text-is("${label}")`).nth(nth).locator("xpath=..");
}

/**
 * El control de texto de un `Field`. `getByLabel` no sirve de forma fiable:
 * cuando `Field` envuelve algo que no es un control nativo le pone
 * `role="group"` con la misma etiqueta, y el locator resuelve a ese `div`.
 */
export function fieldInput(scope: Locator | Page, label: string) {
  return fieldByLabel(scope, label).locator("input, textarea").first();
}

export async function chooseInField(page: Page, fieldScope: Locator, optionText: string) {
  await fieldScope.getByRole("button").first().click();
  await page.locator(".tz-select-pop").getByRole("button", { name: optionText, exact: true }).click();
}

/** Toasts de la app: éxito en `status`, error en `alert`. */
export function toast(page: Page) {
  return page.locator("[role=status], [role=alert]");
}

/**
 * Contraseña de un formulario de onboarding (dueño, personal o socio). Las
 * etiquetas no llevan `htmlFor`, así que se entra por el placeholder, que es
 * lo único estable.
 */
export async function fillNewPassword(page: Page, password: string) {
  await page.getByPlaceholder("Mínimo 8 caracteres").fill(password);
  await page.getByPlaceholder("••••••••").fill(password);
}

/** PNG de 1×1 válido: basta para que el dropzone lo convierta en data URL. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Espera a que el toast con ese texto aparezca, con el margen de una server action en frío. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(toast(page).getByText(text).first()).toBeVisible({ timeout: 15_000 });
}

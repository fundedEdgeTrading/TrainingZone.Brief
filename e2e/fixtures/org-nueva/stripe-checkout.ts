import type { Page } from "@playwright/test";

/**
 * Pago en el Checkout ALOJADO de Stripe (checkout.stripe.com) con la tarjeta
 * de test 4242. Es la única parte del recorrido cuyo HTML no es nuestro: los
 * ids (`#email`, `#cardNumber`, `#billingName`…) son los que Stripe publica en
 * su página de Checkout y pueden cambiar sin aviso. Si este paso falla por un
 * selector, el fallo está aquí y no en la app.
 *
 * - `email`: el Checkout de licencia (plano 1) no conoce al comprador y lo pide;
 *   el del socio va con `customer` y no lo enseña.
 * - `withAddress`: el de licencia exige dirección de facturación
 *   (`billing_address_collection: "required"`, platform-billing.ts).
 */
export async function payHostedCheckout(
  page: Page,
  opts: { email?: string; name: string; withAddress: boolean }
) {
  if (opts.email) await page.locator("#email").fill(opts.email);
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill(opts.name);
  if (opts.withAddress) {
    await page.locator("#billingCountry").selectOption("ES");
    await page.locator("#billingAddressLine1").fill("Calle Alfonso I 10");
    await page.locator("#billingPostalCode").fill("50003");
    await page.locator("#billingLocality").fill("Zaragoza");
  }
  await page.getByTestId("hosted-payment-submit-button").click();
}

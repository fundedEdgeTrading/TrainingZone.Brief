import test from "node:test";
import assert from "node:assert/strict";
import { buildConnectOAuthUrl, buildStripeAuthorizeUrl, parseConnectLanding } from "@/lib/stripe-connect";

/**
 * Sin `stripe_landing`, Stripe abre el OAuth con el alta de cuenta nueva y el
 * director que ya tiene Stripe cree que tiene que crear su empresa desde cero.
 * El botón principal abre el inicio de sesión; el enlace secundario, el alta
 * rellena con los datos del centro.
 *
 * Funciones puras: no tocan la base de datos.
 */

test("Connect: el botón principal abre el login de Stripe y el secundario el alta", () => {
  assert.equal(buildConnectOAuthUrl("org_x", "login"), "/api/stripe/connect/start?landing=login");
  assert.equal(buildConnectOAuthUrl("org_x", "register"), "/api/stripe/connect/start?landing=register");
  assert.equal(buildConnectOAuthUrl("org_x"), "/api/stripe/connect/start");

  assert.equal(parseConnectLanding("login"), "login");
  assert.equal(parseConnectLanding("register"), "register");
  // Un valor desconocido o ausente cae en lo que Stripe haría por defecto.
  assert.equal(parseConnectLanding(null), "register");
  assert.equal(parseConnectLanding("https://evil.example"), "register");

  const login = new URL(buildStripeAuthorizeUrl("nonce", { landing: "login" }));
  assert.equal(login.searchParams.get("stripe_landing"), "login");
  const byDefault = new URL(buildStripeAuthorizeUrl("nonce"));
  assert.equal(byDefault.searchParams.get("stripe_landing"), "register");
});

test("Connect: el alta de Stripe llega rellena con los datos del centro", () => {
  const url = new URL(
    buildStripeAuthorizeUrl("nonce", {
      landing: "register",
      prefill: { email: " direccion@centro.es ", businessName: "Training Zone S.L." },
    })
  );
  assert.equal(url.searchParams.get("stripe_user[email]"), "direccion@centro.es");
  assert.equal(url.searchParams.get("stripe_user[business_name]"), "Training Zone S.L.");
  assert.equal(url.searchParams.get("stripe_user[country]"), "ES");
  // El nonce sigue siendo el `state` y la URL de retorno no cambia.
  assert.equal(url.searchParams.get("state"), "nonce");
  assert.ok(url.searchParams.get("redirect_uri")?.endsWith("/api/stripe/connect/callback"));

  // Sin datos no se manda el campo vacío.
  const empty = new URL(buildStripeAuthorizeUrl("nonce", { prefill: { email: "", businessName: null } }));
  assert.equal(empty.searchParams.has("stripe_user[email]"), false);
  assert.equal(empty.searchParams.has("stripe_user[business_name]"), false);
});

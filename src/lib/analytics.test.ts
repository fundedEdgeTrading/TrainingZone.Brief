import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  CONVERSIONS,
  CONVERSION_ATTRIBUTE,
  analyticsConfig,
  googleSiteVerification,
  isConversionName,
} from "@/lib/analytics";

/**
 * E9-09 · Punto de partida: cero analítica, cero Search Console, cero eventos.
 * Todo el trabajo de SEO de esta épica era opinión.
 */

test("sin dominio configurado no se carga analítica: en CI y en preview, medir es contaminar", () => {
  assert.equal(analyticsConfig({}), null);
  assert.equal(analyticsConfig({ NEXT_PUBLIC_ANALYTICS_DOMAIN: "   " }), null);
});

test("con dominio, la analítica es la sin cookies por defecto y el script se puede autoalojar", () => {
  const porDefecto = analyticsConfig({ NEXT_PUBLIC_ANALYTICS_DOMAIN: "apta.app" });
  assert.deepEqual(porDefecto, { domain: "apta.app", src: "https://plausible.io/js/script.js" });

  const propio = analyticsConfig({
    NEXT_PUBLIC_ANALYTICS_DOMAIN: "apta.app",
    NEXT_PUBLIC_ANALYTICS_SRC: "https://apta.app/stats/script.js",
  });
  assert.equal(propio?.src, "https://apta.app/stats/script.js");
});

test("Search Console: la meta de verificación sale del entorno, no de un literal", () => {
  assert.equal(googleSiteVerification({}), undefined);
  assert.equal(googleSiteVerification({ GOOGLE_SITE_VERIFICATION: " abc123 " }), "abc123");

  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /verification: \{ google: googleSiteVerification\(\) \}/);
});

test("hay evento de conversión en los tres puntos: /planes, centro y lead form", () => {
  assert.deepEqual(Object.values(CONVERSIONS), ["checkout-plataforma", "checkout-centro", "lead-enviado"]);
  assert.equal(isConversionName("checkout-centro"), true);
  assert.equal(isConversionName("clic-cualquiera"), false);
  assert.equal(isConversionName(null), false);

  const planes = readFileSync("src/app/planes/pricing.tsx", "utf8");
  assert.match(planes, /CONVERSIONS\.planCheckout/);

  const centro = readFileSync("src/app/hazte-socio/[orgSlug]/[centerSlug]/page.tsx", "utf8");
  assert.match(centro, /CONVERSIONS\.centerCheckout/);

  // El lead se cuenta al RESPONDER la acción, no al enviar: contar el envío
  // contaría también los que fallan.
  const lead = readFileSync("src/app/lead-form/[orgSlug]/[centerSlug]/public-lead-form.tsx", "utf8");
  assert.match(lead, /trackConversion\(CONVERSIONS\.lead\)/);
});

test("el escuchador es único y en fase de captura: nadie tiene que acordarse de llamarlo", () => {
  const component = readFileSync("src/components/analytics.tsx", "utf8");
  assert.match(component, new RegExp(`getAttribute\\(CONVERSION_ATTRIBUTE\\)`));
  // Captura: un `preventDefault` del manejador del formulario no puede dejar el
  // evento sin contar.
  assert.match(component, /addEventListener\("submit", onSubmit, true\)/);
  assert.equal(CONVERSION_ATTRIBUTE, "data-tz-conversion");
});

test("la línea base de la semana 0 está documentada y sin cifras inventadas", () => {
  const doc = "docs/seo/linea-base.md";
  assert.ok(existsSync(doc), "falta el documento de línea base");
  const text = readFileSync(doc, "utf8");
  assert.match(text, /Posición media/);
  assert.match(text, /Impresiones/);
  assert.match(text, /pendiente/);
});

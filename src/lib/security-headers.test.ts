import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

/**
 * E1-09 · Cabeceras de seguridad HTTP.
 *
 * Verificado con `curl -D -` contra `/login`: `next.config.ts` no definía
 * `async headers()` y no se emitía ninguna. Se prueba la configuración y no
 * una respuesta viva porque es ahí donde vive la política: si alguien borra una
 * directiva, esto falla en el sitio donde se puede leer el porqué.
 *
 * Lo que NO cubre este test —y por eso la historia pide una pasada manual al
 * desplegar— es que la política deje pasar lo que la aplicación usa: el mapa de
 * Leaflet, los gráficos y el checkout de Stripe.
 */

async function headersFor(path: string): Promise<Map<string, string>> {
  const rules = await nextConfig.headers!();
  const found = new Map<string, string>();
  for (const rule of rules) {
    if (!matches(rule.source, path)) continue;
    // Next resuelve las coincidencias en orden y la última gana para una misma
    // clave: es de lo que depende que `no-referrer` pise a la política general.
    for (const header of rule.headers) found.set(header.key, header.value);
  }
  return found;
}

/** Traducción mínima de los patrones que usa la configuración (`:param*`). */
function matches(source: string, path: string): boolean {
  const pattern = source.replace(/\/:[A-Za-z]+\*/g, "(?:/.*)?").replace(/\/:[A-Za-z]+/g, "/[^/]+");
  return new RegExp(`^${pattern}$`).test(path);
}

test("E1-09 · cualquier ruta lleva las cinco cabeceras del escenario", async () => {
  const headers = await headersFor("/login");
  const csp = headers.get("Content-Security-Policy");

  assert.ok(csp, "no se emitía ninguna cabecera: esto es lo que arregla la historia");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
});

test("E1-09 · en producción se emite HSTS con al menos un año", () => {
  const hsts = securityHeaders(true).find((h) => h.key === "Strict-Transport-Security");
  assert.ok(hsts, "en producción tiene que ir");

  const maxAge = Number(/max-age=(\d+)/.exec(hsts.value)?.[1]);
  assert.ok(maxAge >= 31536000, `max-age de al menos un año, y son ${maxAge}`);

  // Y `upgrade-insecure-requests`, que es la otra mitad de "no degradable a HTTP".
  assert.match(contentSecurityPolicy(true), /upgrade-insecure-requests/);

  // En desarrollo NO: fijaría `localhost` a https en el navegador de quien
  // programa, y no hay TLS que exigir.
  assert.equal(
    securityHeaders(false).some((h) => h.key === "Strict-Transport-Security"),
    false
  );
});

test("E1-09 · las rutas con token firmado no mandan Referer a nadie", async () => {
  for (const path of [
    "/activar",
    "/onboarding/abc123",
    "/recuperar-clave/abc123",
    "/verificar-email/abc123",
    "/baja/abc123",
    "/preferencias/abc123",
    "/gestionar-suscripcion/abc123",
    "/api/email/baja/abc123",
  ]) {
    const headers = await headersFor(path);
    assert.equal(headers.get("Referrer-Policy"), "no-referrer", `${path} filtraría el token en Referer`);
    // Y siguen llevando el resto: la regla del token solo pisa una cabecera.
    assert.equal(headers.get("X-Frame-Options"), "DENY", path);
  }
});

test("E1-09 · la política deja pasar lo que la aplicación usa de verdad", async () => {
  const csp = (await headersFor("/dashboard")).get("Content-Security-Policy")!;

  // Teselas del mapa de barrios y del mapa de calor (Leaflet).
  assert.match(csp, /img-src[^;]*https:\/\/\*\.basemaps\.cartocdn\.com/);
  // Fotos de socio y logos, que se guardan como data URL.
  assert.match(csp, /img-src[^;]*data:/);
  // El checkout de Stripe es una navegación de página completa, pero la
  // política contempla también el envío de formulario.
  assert.match(csp, /form-action[^;]*https:\/\/checkout\.stripe\.com/);
  // Sin esto, Next se queda en blanco: no hay nonce por petición.
  assert.match(csp, /script-src[^;]*'unsafe-inline'/);
});

test("E1-09 · lo que nadie usa queda cerrado", async () => {
  const csp = (await headersFor("/login")).get("Content-Security-Policy")!;
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /default-src 'self'/);
});

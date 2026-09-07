/**
 * E1-09 · Cabeceras de seguridad HTTP.
 *
 * Verificado con `curl -D -` contra `/login`: `next.config.ts` no definía
 * `async headers()` y no se emitía **ninguna**. En una aplicación con datos de
 * salud y pantallas de pago eso significa que se podía enmarcar en un iframe
 * ajeno (clickjacking sobre la ficha de un socio o sobre el botón de cobro) y
 * que un solo enlace en http bastaba para degradar la conexión.
 *
 * Vive aquí y no dentro de `next.config.ts` porque una política de seguridad
 * que no se puede leer en un test es una política que se erosiona sola: aquí es
 * una función pura de "¿es producción?" y `security-headers.test.ts` la fija.
 */

export type HttpHeader = { key: string; value: string };

/**
 * Lista blanca: solo se abre lo que la aplicación usa de verdad.
 *
 *  - `img-src` incluye las teselas de CartoDB (mapa de barrios y mapa de calor
 *    del panel, Leaflet), `data:` (fotos de socio y logos, que se guardan como
 *    data URL) y `blob:`.
 *  - `script-src`/`style-src` llevan `'unsafe-inline'`: Next inyecta su
 *    arranque y sus estilos en línea y, sin nonce por petición —que exige
 *    middleware—, quitarlo dejaría la aplicación en blanco. Es la concesión
 *    consciente de esta política; lo que de verdad cierra esta historia es
 *    `frame-ancestors`, `object-src` y `base-uri`.
 *  - El checkout de Stripe es una navegación de página completa
 *    (`window.location.href`), no un iframe, así que no hace falta abrirle
 *    `frame-src`; `form-action` sí lo contempla por si alguna pantalla pasa a
 *    enviarle un formulario.
 *  - En desarrollo se añaden `'unsafe-eval'` y el websocket del recargador de
 *    Next, que en producción no existen.
 */
export function contentSecurityPolicy(isProduction: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://*.basemaps.cartocdn.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "https://api.stripe.com", ...(isProduction ? [] : ["ws:", "wss:"])],
    "form-action": ["'self'", "https://checkout.stripe.com", "https://billing.stripe.com"],
    "frame-src": ["'self'"],
    // Lo que esta historia cierra: la aplicación no es enmarcable por nadie.
    // `X-Frame-Options: DENY` va además, para los navegadores que no leen esta.
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Solo en producción: en desarrollo el servidor es http y esto rompería
  // cualquier recurso local.
  if (isProduction) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Las cabeceras de toda respuesta. */
export function securityHeaders(isProduction: boolean): HttpHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isProduction) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // HSTS solo donde hay TLS: en desarrollo fijaría `localhost` a https en el
    // navegador de quien programa. Dos años e `includeSubDomains`.
    ...(isProduction
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
  ];
}

/**
 * Rutas cuyo secreto viaja EN LA URL: activación, recuperación de contraseña,
 * verificación de email, baja y preferencias de correo, y el portal de
 * suscripción. Con `strict-origin-when-cross-origin` el navegador mandaría el
 * origen en `Referer` al pedir cualquier recurso externo; con `no-referrer` no
 * manda nada, que es lo único que garantiza que el token no se filtre por ahí.
 */
export const SIGNED_TOKEN_ROUTES: readonly string[] = [
  "/activar",
  "/onboarding/:token*",
  "/recuperar-clave/:token*",
  "/verificar-email/:token*",
  "/baja/:token*",
  "/preferencias/:token*",
  "/gestionar-suscripcion/:token*",
  "/api/email/baja/:token*",
];

export const NO_REFERRER_HEADER: HttpHeader = { key: "Referrer-Policy", value: "no-referrer" };

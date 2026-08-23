/**
 * Rutas que se sirven sin sesión. Las usa el proxy (para no rebotar a /login) y
 * `lib/theme` (una pantalla pública no tiene preferencia de tema que leer, así
 * que siempre va en claro). Viven aquí, y no dentro del proxy, para que las dos
 * lecturas no puedan separarse — y sin importar nada de Prisma, que no funciona
 * en el runtime del proxy.
 *
 * "/lead-form" (no "/lead") a propósito: con startsWith(), "/lead" también
 * marcaría pública la sección de gestión "/leads" del staff.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/onboarding",
  "/lead-form",
  "/planes",
  "/demo-checkout",
  "/hazte-socio",
  "/activar",
  "/verificar-email",
  "/recuperar-clave",
  "/gestionar-suscripcion",
  // Preferencias de correo, baja y privacidad: son el pie de todos los emails
  // y tienen que abrirse sin sesión. Exigir login para dejar de recibir correo
  // es, literalmente, no ofrecer un medio sencillo de oposición (Art. 21 RGPD).
  "/preferencias",
  "/baja",
  "/privacidad",
  "/api/email",
  "/servicio-no-disponible",
  "/api/jobs",
  "/api/stripe",
  "/api/checkout",
  "/api/hazte-socio",
  // La API de la app nativa NO usa la cookie de sesión: cada route handler
  // valida su propio token bearer con `requireApiSession`. Pasarla por el
  // chequeo de cookie de aquí la rebotaba entera a /login — incluido su
  // propio endpoint de login, con lo que la app no podía autenticarse nunca.
  "/api/mobile",
];

/**
 * La raíz es pública a propósito (RB-ALTA-001): sin sesión aterriza en la
 * landing comercial de /planes, así que no puede rebotar antes a /login. Se
 * compara por igualdad exacta, no con `startsWith("/")`, porque eso abriría
 * cualquier ruta del sitio.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

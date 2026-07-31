import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Next.js 16 renombró "middleware" a "proxy". Se evita importar "@/auth"
// aquí a propósito: ese módulo carga Prisma (APIs de Node no disponibles
// en el runtime de Proxy), así que la comprobación de sesión usa el JWT
// directamente vía next-auth/jwt, que sí es compatible.

// "/lead-form" (no "/lead") a propósito: con startsWith(), "/lead" también
// marcaría pública la sección de gestión "/leads" del staff.
const PUBLIC_PATHS = [
  "/login",
  "/onboarding",
  "/lead-form",
  "/planes",
  "/hazte-socio",
  "/activar",
  "/verificar-email",
  "/recuperar-clave",
  "/gestionar-suscripcion",
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // La raíz es pública a propósito (RB-ALTA-001): sin sesión aterriza en la
  // landing comercial de /planes, así que no puede rebotar antes a /login. Se
  // compara por igualdad exacta, no con `startsWith("/")`, porque eso abriría
  // cualquier ruta del sitio.
  const isPublic =
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth");

  if (isPublic) return NextResponse.next();

  // Auth.js escribe la cookie de sesión como "__Secure-authjs.session-token"
  // cuando se sirve por HTTPS, y sin prefijo cuando no. `getToken` no lo
  // deduce del request: si no se le pasa `secureCookie` asume `false` y busca
  // siempre el nombre sin prefijo (@auth/core/jwt: `cookieName =
  // defaultCookies(secureCookie ?? false).sessionToken.name`), con lo que en
  // producción nunca encuentra la cookie y todo acaba rebotado a /login. El
  // nombre es además la sal de derivación de la clave (`salt = cookieName`),
  // así que tiene que coincidir para poder descifrar el JWT.
  //
  // Detrás de un proxy inverso (Render, Fly, Nginx...) `nextUrl.protocol`
  // llega como "http:", así que la fuente de verdad es `x-forwarded-proto`.
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secureCookie = forwardedProto === "https" || req.nextUrl.protocol === "https:";

  let token;
  try {
    token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
  } catch {
    token = null;
  }

  if (!token) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};

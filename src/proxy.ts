import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { isPublicPath } from "@/lib/public-paths";

// Next.js 16 renombró "middleware" a "proxy". Se evita importar "@/auth"
// aquí a propósito: ese módulo carga Prisma (APIs de Node no disponibles
// en el runtime de Proxy), así que la comprobación de sesión usa el JWT
// directamente vía next-auth/jwt, que sí es compatible.

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = isPublicPath(pathname) || pathname.startsWith("/api/auth");

  if (isPublic) return withPathname(req);

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

  return withPathname(req);
}

/**
 * Deja la ruta pedida en una cabecera. El layout raíz decide ahí el
 * `<html data-theme>` (handoff "Modo oscuro") y necesita saber si la ruta es de
 * la aplicación autenticada o una pantalla pública, que siempre va en claro —
 * y un layout raíz no conoce el `pathname` por sí mismo.
 */
function withPathname(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};

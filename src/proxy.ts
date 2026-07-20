import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Next.js 16 renombró "middleware" a "proxy". Se evita importar "@/auth"
// aquí a propósito: ese módulo carga Prisma (APIs de Node no disponibles
// en el runtime de Proxy), así que la comprobación de sesión usa el JWT
// directamente vía next-auth/jwt, que sí es compatible.

const PUBLIC_PATHS = ["/login", "/register", "/onboarding"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth");

  if (isPublic) return NextResponse.next();

  let token;
  try {
    token = await getToken({ req, secret: process.env.AUTH_SECRET });
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

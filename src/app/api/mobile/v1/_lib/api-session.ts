import type { Role } from "@prisma/client";
import type { NextResponse } from "next/server";
import { verifyAccessToken, type ApiTokenClaims } from "@/lib/mobile-auth";
import { apiError } from "./response";

/**
 * Equivalente de requireRole()/requireSession() (guard.ts) para la API móvil:
 * lee `Authorization: Bearer <access token>` en vez de cookie, y devuelve
 * 401/403 JSON en vez de redirect(). orgId/centerId siempre salen del token
 * firmado, nunca de un parámetro del cliente (invariante multi-tenant).
 */
export async function requireApiSession(req: Request): Promise<ApiTokenClaims | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  return verifyAccessToken(token);
}

export type ApiRoleResult =
  | { ok: true; claims: ApiTokenClaims }
  | { ok: false; response: NextResponse };

export async function requireApiRole(req: Request, allowed: Role[]): Promise<ApiRoleResult> {
  const claims = await requireApiSession(req);
  if (!claims) return { ok: false, response: apiError("No autenticado.", 401) };
  if (!allowed.includes(claims.role)) return { ok: false, response: apiError("No autorizado.", 403) };
  return { ok: true, claims };
}

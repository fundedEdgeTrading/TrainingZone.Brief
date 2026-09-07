import type { Role } from "@prisma/client";
import type { NextResponse } from "next/server";
import { verifyAccessToken, type ApiTokenClaims } from "@/lib/mobile-auth";
import { isPlatformOperational } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { requireApiRouteFeature } from "./api-guards";
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

/**
 * RB-PLAT-001, espejo del layout web (`(app)/layout.tsx`): una organización
 * sin plan operativo pierde el acceso también desde la app móvil, no solo por
 * la web. `PLATFORM_ADMIN` queda exento (soporte de Apta), igual que en web.
 * Sin esto, suspender a un gimnasio por impago no le cortaba la app.
 */
async function assertPlatformOperational(orgId: string, role: Role): Promise<NextResponse | null> {
  if (role === "PLATFORM_ADMIN") return null;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { platformStatus: true } });
  if (org && !isPlatformOperational(org.platformStatus)) {
    return apiError("Tu organización no tiene el servicio activo. Contacta con quien gestiona la plataforma.", 402);
  }
  return null;
}

export async function requireApiRole(req: Request, allowed: Role[]): Promise<ApiRoleResult> {
  const claims = await requireApiSession(req);
  if (!claims) return { ok: false, response: apiError("No autenticado.", 401) };
  if (!allowed.includes(claims.role)) return { ok: false, response: apiError("No autorizado.", 403) };
  const platformBlock = await assertPlatformOperational(claims.orgId, claims.role);
  if (platformBlock) return { ok: false, response: platformBlock };
  return { ok: true, claims };
}

/**
 * E6-01 (RB-PLAT-008): `requireApiRole` + gateo por el plan contratado, que es
 * la guarda que la API móvil no tenía.
 *
 * Verificado en ejecución: con la organización demo en `esencial_mes`
 * (`features: []`), `GET /trainer/brief` devolvía 200 con la lista completa y
 * `GET /trainer/members?filter=alerts` devolvía `{"light":"RED","zone":"rodilla
 * derecha"}`. En web esas dos redirigen a `/planes`. Session Brief, semáforo de
 * aptitud, zona de lesión, rangos de composición y feedback 1-10 eran gratis
 * desde la app: fuga de ingresos directa.
 *
 * `route` es la ruta del sistema de ficheros SIN el prefijo `/api/mobile/v1` y
 * con los segmentos dinámicos tal cual (`/trainer/brief/[id]`). El gate se
 * hereda del padre (`MOBILE_FEATURE_BY_ROUTE`), así que una ruta hija nueva
 * queda cubierta sin declarar nada; y una ruta que no esté declarada ni con
 * gate ni sin él hace fallar `mobile-feature-routes.test.ts`.
 *
 * Devuelve 402, no 403: no es que esta persona no pueda, es que su organización
 * no lo ha contratado — y la app necesita distinguirlo para ofrecer el cambio
 * de plan en vez de un error de permisos o una pantalla en blanco.
 */
export async function requireApiRoute(req: Request, allowed: Role[], route: string): Promise<ApiRoleResult> {
  const auth = await requireApiRole(req, allowed);
  if (!auth.ok) return auth;
  const gate = await requireApiRouteFeature(auth.claims, route);
  if (!gate.ok) return gate;
  return auth;
}

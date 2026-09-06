import type { NextResponse } from "next/server";
import type { PlatformFeature } from "@/lib/platform-plans";
import type { ApiTokenClaims } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { isCenterInScope } from "@/lib/center-scope";
import { orgHasFeature } from "@/lib/entitlements";
import { featureForMobileRoute } from "@/lib/mobile-feature-routes";
import { apiError } from "./response";

/**
 * Guardas compartidas de la API móvil. Van APARTE de `api-session.ts` (que
 * resuelve identidad y rol) porque lo que deciden es otra cosa: hasta dónde
 * llega esta persona dentro de su organización, y qué ha comprado su
 * organización.
 *
 * Las dos son el patrón "espejo móvil" que más se ha roto en este código: la
 * web comprobaba y la app no, sobre los mismos datos.
 */

export type ApiGuardBlock = { ok: false; response: NextResponse };
export type ApiGuardResult = { ok: true } | ApiGuardBlock;

/**
 * Ámbito de centro para la API móvil (invariante del trimestre: toda lectura y
 * toda escritura con `centerId` pasa por aquí o por `isCenterInScope`).
 *
 * Dos comprobaciones, y las dos hacen falta:
 *
 *  1. Que el centro sea de la organización del token. Esto no lo cubre
 *     `isCenterInScope`: para los roles de ámbito organización devuelve `true`
 *     sin mirar el `orgId`, así que un `centerId` de OTRA organización pasaría.
 *  2. Que esté dentro de la imputación real de quien pide (centro base +
 *     `CenterMembership`), que es lo que separa a una dirección de centro de
 *     la dirección de la organización.
 */
export async function requireApiCenterScope(claims: ApiTokenClaims, centerId: string): Promise<ApiGuardResult> {
  const center = await prisma.center.findFirst({
    where: { id: centerId, orgId: claims.orgId },
    select: { id: true },
  });
  if (!center) return { ok: false, response: apiError("Ese centro no es uno de los tuyos.", 403) };

  const inScope = await isCenterInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    centerId
  );
  if (!inScope) return { ok: false, response: apiError("Ese centro no es uno de los tuyos.", 403) };

  return { ok: true };
}

/**
 * Gateo por plan (E6-01). Responde **402 Payment Required**, no 403: no es que
 * esta persona no pueda, es que su organización no lo ha contratado — y la app
 * necesita distinguirlo para pintar "tu plan no incluye esto" en vez de un
 * error de permisos o una pantalla en blanco.
 *
 * `PLATFORM_ADMIN` queda exento, igual que en `requireFeature` (soporte de Apta).
 */
export async function requireApiFeature(claims: ApiTokenClaims, feature: PlatformFeature): Promise<ApiGuardResult> {
  if (claims.role === "PLATFORM_ADMIN") return { ok: true };

  const org = await prisma.organization.findUnique({
    where: { id: claims.orgId },
    select: { platformPlan: true, platformStatus: true },
  });
  if (!org || !orgHasFeature(org, feature)) {
    return {
      ok: false,
      response: apiError("Tu plan no incluye esta funcionalidad.", 402, { feature }),
    };
  }
  return { ok: true };
}

/**
 * Aplica el mapa declarativo a una ruta concreta. Es lo que permite que el gate
 * se herede a las hijas: una ruta nueva bajo `/trainer/brief` queda gateada sin
 * tocar nada.
 */
export async function requireApiRouteFeature(claims: ApiTokenClaims, pathname: string): Promise<ApiGuardResult> {
  const feature = featureForMobileRoute(pathname);
  if (!feature) return { ok: true };
  return requireApiFeature(claims, feature);
}

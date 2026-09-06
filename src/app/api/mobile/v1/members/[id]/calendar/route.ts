import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageMembers, canViewHealthData } from "@/lib/rbac";
import { isMemberInScope } from "@/lib/center-scope";
import { getMemberCalendar, getMemberCalendarWithDebrief } from "../../../_lib/calendar";
import { requireApiRole } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

// Mapa de calor mensual de la ficha del socio (D3).
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "RECEPTION", "PLATFORM_ADMIN"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageMembers(claims.role)) return apiError("No tienes permiso para ver los socios.", 403);
  const { id } = await params;

  // El socio tiene que ser de la organización del token, nunca del id a secas.
  const member = await prisma.member.findFirst({ where: { id, orgId: claims.orgId }, select: { id: true } });
  if (!member) return apiError("No se ha encontrado el socio.", 404);
  // ...y además de un centro suyo (center-scope.ts), igual que en la web.
  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    member.id
  );
  if (!inScope) return apiError("No se ha encontrado el socio.", 404);

  // E1-06 (RB-SEG-004): la media del debrief promedia movilidad y dolor
  // invertido, así que es dato de salud y va por `canViewHealthData` — el mismo
  // predicado que deja fuera a recepción en el resto de la aplicación. Para esos
  // roles el payload no lleva la clave: ni con valor ni como `null`.
  const month = req.nextUrl.searchParams.get("month");
  const calendar = canViewHealthData(claims.role)
    ? await getMemberCalendarWithDebrief(member.id, month)
    : await getMemberCalendar(member.id, month);
  return apiOk(calendar);
}

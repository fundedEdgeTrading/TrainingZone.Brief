import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageMembers } from "@/lib/rbac";
import { getMemberCalendar } from "../../../_lib/calendar";
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

  const calendar = await getMemberCalendar(member.id, req.nextUrl.searchParams.get("month"));
  return apiOk(calendar);
}

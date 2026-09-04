import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { isMemberInScope } from "@/lib/center-scope";
import { canManageMesocycles } from "@/lib/rbac";
import { approveMesocycle, getMesocycleDetail } from "@/lib/mesocycle-queries";
import { requireApiRole } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

// RB innegociable (§7.4): nada que salga de un modelo llega al socio sin que
// una persona cualificada lo firme. La app puede firmar; no puede saltarse el
// borrador ni editar el plan (eso sigue en la web).
const MESOCYCLE_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, MESOCYCLE_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageMesocycles(claims.role)) return apiError("No tienes permiso para aprobar mesociclos.", 403);
  const { id } = await params;

  const detail = await getMesocycleDetail(claims.orgId, id);
  if (!detail) return apiError("Mesociclo no encontrado.", 404);
  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    detail.memberId
  );
  if (!inScope) return apiError("Mesociclo no encontrado.", 404);

  const result = await approveMesocycle(claims.orgId, id, claims.sub);
  if (!result.ok) return apiError(result.error, 400);
  return apiOk({ approved: true });
}

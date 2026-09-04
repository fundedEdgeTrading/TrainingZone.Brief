import type { NextRequest } from "next/server";
import type { LeadStatus, Role } from "@prisma/client";
import { addLeadNote, assignLeadOwner, updateLeadStage } from "@/lib/leads-queries";
import { canManageLeads } from "@/lib/rbac";
import { isCenterInScope } from "@/lib/center-scope";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

const LEAD_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "RECEPTION", "TRAINER", "TRAINER_ADMIN"];

/** Solo las etapas abiertas: archivar y cerrar con cobro siguen siendo de la web. */
const MOVABLE = ["SIN_CONTACTAR", "SEGUIMIENTO", "CON_FECHA_VALORACION"] as const;
type MovableStage = (typeof MOVABLE)[number];

function isMovable(status: LeadStatus): status is MovableStage {
  return (MOVABLE as readonly string[]).includes(status);
}

type PatchBody = { status?: LeadStatus; note?: string; claimOwner?: boolean };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, LEAD_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageLeads(claims.role)) return apiError("No tienes permiso para gestionar leads.", 403);
  const { id } = await params;

  // El centro sale del lead, nunca del cuerpo de la petición.
  const lead = await prisma.lead.findFirst({ where: { id, orgId: claims.orgId }, select: { centerId: true } });
  if (!lead) return apiError("Lead no encontrado.", 404);
  const inScope = await isCenterInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    lead.centerId
  );
  if (!inScope) return apiError("Lead no encontrado.", 404);

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return apiError("Petición vacía.", 400);

  // RB-LEAD-003: registrar el contacto desde el móvil se lleva el lead consigo
  // — quien llama pasa a ser su responsable si no tenía ninguno.
  if (body.claimOwner) {
    const assigned = await assignLeadOwner(claims.orgId, id, claims.sub);
    if (!assigned.ok) return apiError(assigned.error, 400);
  }

  if (body.note?.trim()) {
    const noted = await addLeadNote(claims.orgId, id, claims.sub, body.note);
    if (!noted.ok) return apiError(noted.error, 400);
  }

  if (body.status) {
    if (!isMovable(body.status)) {
      return apiError("Desde la app solo se mueve el lead entre etapas abiertas.", 400);
    }
    const moved = await updateLeadStage(claims.orgId, id, body.status);
    if (!moved.ok) return apiError(moved.error, 400);
  }

  return apiOk({ updated: true });
}

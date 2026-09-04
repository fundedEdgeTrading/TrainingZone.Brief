import type { NextRequest } from "next/server";
import type { LeadStatus, Role } from "@prisma/client";
import { listLeads } from "@/lib/leads-queries";
import { canManageLeads } from "@/lib/rbac";
import { centerScopeFor } from "@/lib/center-scope";
import { requireApiRole } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

/**
 * Embudo comercial (F8) en la app. Se enseña la fila de cuatro contadores del
 * embudo y las fichas con las dos acciones que un entrenador hace de verdad
 * desde el móvil: llamar y agendar la prueba.
 *
 * Lo que NO entra: dar de alta un lead (formulario largo con CP, ocupación y
 * salud) ni cerrarlo con cobro. Eso sigue en la web, donde está el formulario
 * completo y el cobro; meterlo aquí a medias produciría leads incompletos.
 */
const LEAD_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "RECEPTION", "TRAINER", "TRAINER_ADMIN"];

const ACTIVE_STAGES: LeadStatus[] = ["SIN_CONTACTAR", "SEGUIMIENTO", "CON_FECHA_VALORACION", "CERRADO"];

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, LEAD_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageLeads(claims.role)) return apiError("No tienes permiso para ver los leads.", 403);

  const scope = await centerScopeFor({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
  const stageParam = req.nextUrl.searchParams.get("stage");
  const stage = ACTIVE_STAGES.includes(stageParam as LeadStatus) ? (stageParam as LeadStatus) : null;

  const leads = await listLeads(claims.orgId, { q: req.nextUrl.searchParams.get("search")?.trim() || undefined });
  // El ámbito de centro se aplica aquí porque `listLeads` acepta un único
  // centro y el staff multi-centro tiene varios imputados.
  const visible = scope ? leads.filter((l) => scope.includes(l.centerId)) : leads;

  const counts = {
    SIN_CONTACTAR: visible.filter((l) => l.status === "SIN_CONTACTAR").length,
    SEGUIMIENTO: visible.filter((l) => l.status === "SEGUIMIENTO").length,
    CON_FECHA_VALORACION: visible.filter((l) => l.status === "CON_FECHA_VALORACION").length,
    CERRADO: visible.filter((l) => l.status === "CERRADO").length,
  };

  const rows = (stage ? visible.filter((l) => l.status === stage) : visible.filter((l) => l.status !== "NO_CERRADO"))
    .slice(0, 100)
    .map((lead) => ({
      id: lead.id,
      name: `${lead.firstName} ${lead.lastName}`.trim(),
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      channel: lead.channel,
      goals: lead.goals,
      centerName: lead.center.name,
      ownerName: lead.owner?.name ?? null,
      createdAt: lead.createdAt.toISOString(),
      contactedAt: lead.contactedAt.toISOString(),
    }));

  return apiOk({ counts, leads: rows });
}

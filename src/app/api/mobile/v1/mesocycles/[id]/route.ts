import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { isMemberInScope } from "@/lib/center-scope";
import { canManageMesocycles } from "@/lib/rbac";
import { getMesocycleDetail } from "@/lib/mesocycle-queries";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

// Borrador/plan completo tal como lo pinta la app: cabecera, "No se puede
// programar" (safetyCriteria), reparto semanal, hitos, fases y el entreno de
// cada día con su porqué. Es de lectura: el editor completo sigue en la web.
const MESOCYCLE_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"];

/** Las columnas Json del modelo llegan como `unknown`: a lista de textos. */
function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** `milestones` es semana → hito; se acepta también la forma plana en texto. */
function asMilestones(value: unknown): { week: number; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { week: 0, text: entry };
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const week = Number(row.week ?? row.semana ?? 0);
        const text = typeof row.text === "string" ? row.text : typeof row.hito === "string" ? row.hito : null;
        if (text) return { week: Number.isFinite(week) ? week : 0, text };
      }
      return null;
    })
    .filter((m): m is { week: number; text: string } => m !== null);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, MESOCYCLE_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageMesocycles(claims.role)) return apiError("No tienes permiso para ver los mesociclos.", 403);
  const { id } = await params;

  const detail = await getMesocycleDetail(claims.orgId, id);
  if (!detail) return apiError("Mesociclo no encontrado.", 404);
  // El socio sale SIEMPRE del mesociclo, nunca de un parámetro del cliente.
  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    detail.memberId
  );
  if (!inScope) return apiError("Mesociclo no encontrado.", 404);

  return apiOk({
    id: detail.id,
    memberId: detail.memberId,
    title: detail.title,
    status: detail.status,
    objective: detail.objective,
    safetyCriteria: asStrings(detail.safetyCriteria),
    weeklyLayout: asStrings(detail.weeklyLayout),
    milestones: asMilestones(detail.milestones),
    createdAt: detail.createdAt.toISOString(),
    approvedAt: detail.approvedAt?.toISOString() ?? null,
    phases: detail.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      weekFrom: phase.weekFrom,
      weekTo: phase.weekTo,
      notes: phase.notes,
      days: phase.days.map((day) => ({
        id: day.id,
        label: day.label,
        venue: day.venue,
        focus: day.focus,
        warmup: asStrings(day.warmup),
        blocks: day.blocks.map((block) => ({
          id: block.id,
          name: block.name,
          durationMin: block.durationMin,
          exercises: block.exercises.map((ex) => ({
            id: ex.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            load: ex.load,
            description: ex.description,
            rationale: ex.rationale,
          })),
        })),
      })),
    })),
  });
}

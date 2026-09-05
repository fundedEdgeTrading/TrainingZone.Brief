import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { isMemberInScope } from "@/lib/center-scope";
import { canManageMesocycles } from "@/lib/rbac";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { getMesocycleBriefingForMember } from "@/lib/health-access";
import { generateMesocyclePlan } from "@/lib/ai/mesocycle-generator";
import { createMesocycleFromPlan, listMesocyclesForMember } from "@/lib/mesocycle-queries";
import { requireApiRole } from "../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../_lib/response";

// Pestaña «Plan» de la ficha del socio en la app (espejo de
// members/[id]/mesociclos en web). Se apoya en las MISMAS piezas que la acción
// del servidor de la web —briefing seudonimizado, generador y `createMesocycleFromPlan`—
// para que la app no pueda saltarse ni la seudonimización ni el estado DRAFT.
const MESOCYCLE_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"];

const MIN_WEEKS = 4;
const MAX_WEEKS = 12;

async function guard(req: NextRequest, memberId: string) {
  const auth = await requireApiRole(req, MESOCYCLE_ROLES);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const { claims } = auth;
  if (!canManageMesocycles(claims.role)) {
    return { ok: false as const, response: apiError("No tienes permiso para ver los mesociclos.", 403) };
  }
  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    memberId
  );
  if (!inScope) return { ok: false as const, response: apiError("No se ha encontrado el socio.", 404) };
  return { ok: true as const, claims };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if (!g.ok) return g.response;

  const mesocycles = await listMesocyclesForMember(g.claims.orgId, id);
  return apiOk({
    // El botón de generar se apaga si la organización no tiene IA configurada:
    // mejor eso que una espera de minuto y medio que acaba en error.
    aiConfigured: isAiConfigured(),
    mesocycles: mesocycles.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      approvedAt: m.approvedAt?.toISOString() ?? null,
    })),
  });
}

type GenerateBody = { level?: string; weeks?: number; availability?: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if (!g.ok) return g.response;
  const { claims } = g;

  if (!isAiConfigured()) return apiError("La generación con IA no está configurada en este entorno.", 400);

  const body = (await req.json().catch(() => null)) as GenerateBody | null;
  const weeks = Number(body?.weeks ?? 8);
  if (!Number.isInteger(weeks) || weeks < MIN_WEEKS || weeks > MAX_WEEKS) {
    return apiError(`El mesociclo va de ${MIN_WEEKS} a ${MAX_WEEKS} semanas.`, 400);
  }
  // Mismo criterio que la web (`lines()` en `members/[id]/mesociclos/actions.ts`):
  // quita también viñetas iniciales, para que "- Lunes TZ" llegue igual al
  // modelo se mande desde donde se mande.
  const availability = (body?.availability ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*·]\s*/, "").trim())
    .filter(Boolean);
  if (availability.length === 0) return apiError("Indica al menos un día de disponibilidad.", 400);

  // Único punto por el que salen datos del socio hacia la IA: seudonimiza y audita.
  const briefing = await getMesocycleBriefingForMember({
    memberId: id,
    orgId: claims.orgId,
    actorUserId: claims.sub,
    actorRole: claims.role,
    level: (body?.level ?? "").trim(),
    weeks,
    availability,
  });
  if (!briefing) return apiError("No se pudo preparar la ficha para la generación.", 400);

  const generated = await generateMesocyclePlan(briefing);
  if (!generated.ok) return apiError(generated.error, 502);

  const created = await createMesocycleFromPlan({
    orgId: claims.orgId,
    memberId: id,
    createdByUserId: claims.sub,
    plan: generated.plan,
    conversation: generated.conversation,
  });
  if (!created.ok) return apiError(created.error, 400);

  return apiOk({ mesocycleId: created.mesocycleId });
}

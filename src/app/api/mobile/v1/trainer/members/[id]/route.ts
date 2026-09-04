import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { getTrainerMemberDetail } from "@/lib/trainer-members-queries";
import { isMemberInScope } from "@/lib/center-scope";
import { canManageMesocycles } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

const TRAINER_ROLES: Role[] = ["TRAINER", "TRAINER_ADMIN", "OWNER", "CENTER_DIRECTOR"];
const MAX_NOTE_LENGTH = 2000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, TRAINER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  // El ámbito de centro se comprueba igual que en la ficha de dirección: el
  // predicado de rol abre la pantalla, el ámbito abre ESTE socio.
  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    id
  );
  if (!inScope) return apiError("No se ha encontrado el socio.", 404);

  const detail = await getTrainerMemberDetail(claims.orgId, id, { userId: claims.sub, role: claims.role });
  if (!detail) return apiError("No se ha encontrado el socio.", 404);

  return apiOk({ ...detail, canManageMesocycles: canManageMesocycles(claims.role) });
}

type NoteBody = { body?: string };

/** «Nueva nota» de la ficha: el gesto que el entrenador hace en la sala. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, TRAINER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    id
  );
  if (!inScope) return apiError("No se ha encontrado el socio.", 404);

  const payload = (await req.json().catch(() => null)) as NoteBody | null;
  const body = payload?.body?.trim();
  if (!body) return apiError("Escribe la nota antes de guardarla.", 400);
  if (body.length > MAX_NOTE_LENGTH) return apiError("La nota es demasiado larga.", 400);

  const note = await prisma.memberNote.create({
    data: { orgId: claims.orgId, memberId: id, authorUserId: claims.sub, body },
    select: { id: true },
  });
  return apiOk({ id: note.id });
}

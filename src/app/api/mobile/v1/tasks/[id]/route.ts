import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reopenTask, setTaskProgress } from "@/lib/tasks-queries";
import { resolveNotification } from "@/lib/notifications";
import { canWorkOnTask } from "@/lib/rbac";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER"];

type PatchBody = { status?: "PENDIENTE" | "EN_CURSO" | "HECHA" };

/**
 * Mover una tarea de estado desde la app. `canWorkOnTask` (RB-TASK-001): la
 * mueve quien la tiene asignada, más quien reparte. Nadie toca la de otro.
 *
 * "Hecha" no se escribe a mano: pasa por `resolveNotification`, el mismo camino
 * que usan la campana y el motor de reglas, para que completar una tarea
 * signifique siempre lo mismo.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const task = await prisma.notification.findFirst({
    where: { id, orgId: claims.orgId, kind: "TASK" },
    select: { id: true, recipientUserId: true, resolvedAt: true },
  });
  if (!task) return apiError("Tarea no encontrada.", 404);
  if (!canWorkOnTask(claims.role, claims.sub, task)) return apiError("Esa tarea no es tuya.", 403);

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  const status = body?.status;
  if (status !== "PENDIENTE" && status !== "EN_CURSO" && status !== "HECHA") {
    return apiError("Estado de tarea no válido.", 400);
  }

  if (status === "HECHA") {
    const done = await resolveNotification(claims.orgId, claims.sub, id, { anyRecipient: true });
    if (!done.ok) return apiError("Tarea no encontrada.", 404);
    return apiOk({ status });
  }

  // Reabrir y mover son dos caminos distintos: una tarea del histórico vuelve a
  // "Pendiente" antes de poder pasar a "En curso".
  if (task.resolvedAt) {
    const reopened = await reopenTask(claims.orgId, id);
    if (!reopened.ok) return apiError(reopened.error, 400);
    if (status === "PENDIENTE") return apiOk({ status });
  }

  const moved = await setTaskProgress(claims.orgId, id, status);
  if (!moved.ok) return apiError(moved.error, 400);
  return apiOk({ status });
}

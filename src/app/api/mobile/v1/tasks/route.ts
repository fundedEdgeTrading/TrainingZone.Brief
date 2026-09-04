import type { NextRequest } from "next/server";
import type { Role, TaskPriority } from "@prisma/client";
import { createManualTask, listAssignableUsers, listTasks, type TaskScope } from "@/lib/tasks-queries";
import { taskStatus, TASK_PRIORITIES } from "@/lib/tasks";
import { canAssignTasks } from "@/lib/rbac";
import { centerScopeFor } from "@/lib/center-scope";
import { parseDateParam } from "@/lib/date-utils";
import { requireApiRole } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

/**
 * Tareas (F10) en la app. El tablero de la web reparte trabajo de todo el
 * centro; en el móvil la bandeja es la del propio usuario, que es lo que se
 * mira entre sesión y sesión. Quien reparte (`canAssignTasks`) puede además
 * pedir la vista de todo el equipo con `?scope=team`.
 *
 * Una tarea es una `Notification` con `kind = TASK`: la misma fila que levanta
 * el motor de reglas. Aquí no se inventa un modelo nuevo, solo se le da forma
 * de lista con cortes por vencimiento.
 */
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER"];

const MAX_BODY_LENGTH = 2000;

function serialize(task: Awaited<ReturnType<typeof listTasks>>[number], actorUserId: string) {
  return {
    id: task.id,
    title: task.title,
    body: task.body,
    category: task.category,
    priority: task.priority,
    status: taskStatus(task),
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    resolvedAt: task.resolvedAt?.toISOString() ?? null,
    recipientUserId: task.recipientUserId,
    recipientName: task.recipient?.name ?? null,
    createdByName: task.createdBy?.name ?? null,
    /** «Te la asignó dirección»: la encargó otra persona, no el propio usuario. */
    assignedByOther: Boolean(task.createdBy && task.createdBy.id !== actorUserId),
    mine: task.recipientUserId === actorUserId,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const params = req.nextUrl.searchParams;
  const team = params.get("scope") === "team" && canAssignTasks(claims.role);
  const recipientUserId = team ? undefined : claims.sub;

  // Ámbito de centro (center-scope.ts): la vista de equipo es la de LOS
  // CENTROS de quien reparte, no la de toda la organización.
  const centerScope = team ? await centerScopeFor({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId }) : null;
  const centerIds = centerScope ?? undefined;

  const [active, recent, assignables] = await Promise.all([
    listTasks(claims.orgId, { scope: "activas" as TaskScope, recipientUserId, centerIds: team ? centerIds : undefined }),
    listTasks(claims.orgId, { scope: "recien-hechas" as TaskScope, recipientUserId, centerIds: team ? centerIds : undefined }),
    canAssignTasks(claims.role) ? listAssignableUsers(claims.orgId, centerIds) : Promise.resolve([]),
  ]);

  const serialized = active.map((t) => serialize(t, claims.sub));
  return apiOk({
    canAssign: canAssignTasks(claims.role),
    scope: team ? "team" : "mine",
    counts: {
      todo: serialized.filter((t) => t.status === "PENDIENTE").length,
      doing: serialized.filter((t) => t.status === "EN_CURSO").length,
      done: recent.length,
    },
    tasks: serialized,
    done: recent.map((t) => serialize(t, claims.sub)),
    assignables: assignables.map((u) => ({ id: u.id, name: u.name, role: u.role })),
  });
}

type CreateBody = {
  title?: string;
  body?: string | null;
  category?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  recipientUserId?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const payload = (await req.json().catch(() => null)) as CreateBody | null;
  const title = payload?.title?.trim();
  if (!title) return apiError("Escribe de qué va la tarea.", 400);
  if ((payload?.body ?? "").length > MAX_BODY_LENGTH) return apiError("El detalle de la tarea es demasiado largo.", 400);

  // RB-TASK-001: encargarle trabajo a otra persona exige permiso; crearse una a
  // uno mismo lo puede hacer cualquiera del equipo.
  const requested = payload?.recipientUserId?.trim() || claims.sub;
  if (requested !== claims.sub && !canAssignTasks(claims.role)) {
    return apiError("No tienes permiso para asignar tareas a otras personas.", 403);
  }
  if (requested !== claims.sub) {
    const scope = await centerScopeFor({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
    if (scope !== null) {
      const assignable = await listAssignableUsers(claims.orgId, scope);
      if (!assignable.some((u) => u.id === requested)) {
        return apiError("Esa persona no está en tu ámbito de centro.", 403);
      }
    }
  }

  const priority: TaskPriority = TASK_PRIORITIES.includes(payload?.priority as TaskPriority)
    ? (payload!.priority as TaskPriority)
    : "MEDIA";

  const result = await createManualTask({
    orgId: claims.orgId,
    createdByUserId: claims.sub,
    recipientUserId: requested,
    title,
    body: payload?.body ?? null,
    category: payload?.category ?? null,
    priority,
    dueDate: payload?.dueDate ? parseDateParam(payload.dueDate) : null,
  });
  if (!result.ok) return apiError(result.error, 400);
  return apiOk({ id: result.taskId });
}

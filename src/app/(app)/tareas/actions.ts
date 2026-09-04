"use server";

import { revalidatePath } from "next/cache";
import type { Role, TaskPriority } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { canAssignTasks, canWorkOnTask } from "@/lib/rbac";
import { centerScopeFor } from "@/lib/center-scope";
import { resolveNotification } from "@/lib/notifications";
import {
  createManualTask,
  listAssignableUsers,
  reassignTask,
  reopenTask,
  setTaskProgress,
  type TaskActionResult,
  type TaskWriteResult,
} from "@/lib/tasks-queries";
import { prisma } from "@/lib/prisma";

/**
 * Acciones del tablero de tareas. Todo el que trabaja en un centro entra aquí
 * —una tarea la ejecuta cualquiera del equipo—, y dentro se distingue lo que
 * cada rol puede hacer: repartir trabajo es de dirección y Entrenador Admin
 * (`canAssignTasks`); mover y completar, de quien la tiene asignada además de
 * quien reparte (`canWorkOnTask`).
 */
const STAFF_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION", "HR_MANAGER"] as const;

const PRIORITIES: TaskPriority[] = ["BAJA", "MEDIA", "ALTA"];

/** Fecha límite del formulario: `<input type="date">` da "YYYY-MM-DD" o vacío. */
function parseDueDate(raw: string): Date | null | "invalid" {
  if (!raw.trim()) return null;
  // Se ancla al final del día local: una tarea con fecha límite "hoy" vence al
  // cerrar el centro, no a las 00:00 —que la daría por vencida nada más crearla.
  const date = new Date(`${raw}T23:59:59`);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

export async function createTaskAction(formData: FormData): Promise<TaskWriteResult> {
  const session = await requireRole([...STAFF_ROLES]);
  const { id: actorId, orgId, role } = session.user;

  const recipientUserId = String(formData.get("recipientUserId") ?? "") || actorId;
  // Sin permiso para repartir solo se puede uno apuntar trabajo a sí mismo: es
  // una nota propia, no un encargo a otro.
  if (recipientUserId !== actorId && !canAssignTasks(role)) {
    return { ok: false, error: "No tienes permiso para asignar tareas a otras personas." };
  }
  // Ámbito de centro: repartir trabajo a alguien de otro centro que uno no
  // dirige es el mismo agujero que ya se cerró para leads y cobros.
  if (recipientUserId !== actorId) {
    const scope = await centerScopeFor(session.user);
    if (scope !== null) {
      const assignable = await listAssignableUsers(orgId, scope);
      if (!assignable.some((u) => u.id === recipientUserId)) {
        return { ok: false, error: "Esa persona no está en tu ámbito de centro." };
      }
    }
  }

  const dueDate = parseDueDate(String(formData.get("dueDate") ?? ""));
  if (dueDate === "invalid") return { ok: false, error: "La fecha límite no es válida." };

  const rawPriority = String(formData.get("priority") ?? "MEDIA") as TaskPriority;
  const priority = PRIORITIES.includes(rawPriority) ? rawPriority : "MEDIA";

  const result = await createManualTask({
    orgId,
    createdByUserId: actorId,
    recipientUserId,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    category: String(formData.get("category") ?? ""),
    priority,
    dueDate,
  });
  if (result.ok) revalidatePath("/tareas");
  return result;
}

export async function reassignTaskAction(taskId: string, recipientUserId: string): Promise<TaskActionResult> {
  const session = await requireRole([...STAFF_ROLES]);
  if (!canAssignTasks(session.user.role)) return { ok: false, error: "No tienes permiso para reasignar tareas." };

  const scope = await centerScopeFor(session.user);
  if (scope !== null) {
    const assignable = await listAssignableUsers(session.user.orgId, scope);
    if (!assignable.some((u) => u.id === recipientUserId)) {
      return { ok: false, error: "Esa persona no está en tu ámbito de centro." };
    }
  }

  const result = await reassignTask(session.user.orgId, taskId, recipientUserId);
  if (result.ok) revalidatePath("/tareas");
  return result;
}

/** Comprueba que la tarea es de la organización y que el actor puede tocarla. */
async function requireTaskAccess(taskId: string, orgId: string, actorId: string, role: Role) {
  const task = await prisma.notification.findFirst({
    where: { id: taskId, orgId, kind: "TASK" },
    select: { recipientUserId: true },
  });
  if (!task) return { ok: false as const, error: "Tarea no encontrada." };
  if (!canWorkOnTask(role, actorId, task)) return { ok: false as const, error: "Esta tarea no es tuya." };
  return { ok: true as const };
}

export async function moveTaskAction(taskId: string, status: "PENDIENTE" | "EN_CURSO"): Promise<TaskActionResult> {
  const session = await requireRole([...STAFF_ROLES]);
  const { id: actorId, orgId, role } = session.user;

  const access = await requireTaskAccess(taskId, orgId, actorId, role);
  if (!access.ok) return access;

  const result = await setTaskProgress(orgId, taskId, status);
  if (result.ok) revalidatePath("/tareas");
  return result;
}

export async function completeTaskAction(taskId: string): Promise<TaskActionResult> {
  const session = await requireRole([...STAFF_ROLES]);
  const { id: actorId, orgId, role } = session.user;

  const access = await requireTaskAccess(taskId, orgId, actorId, role);
  if (!access.ok) return access;

  // Mismo camino que la campana y que el motor de reglas: `anyRecipient` solo
  // amplía el destinatario permitido, y quién puede llegar hasta aquí ya lo ha
  // decidido `requireTaskAccess`.
  const result = await resolveNotification(orgId, actorId, taskId, { anyRecipient: true });
  if (!result.ok) return { ok: false, error: "No se pudo completar la tarea." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function reopenTaskAction(taskId: string): Promise<TaskActionResult> {
  const session = await requireRole([...STAFF_ROLES]);
  const { id: actorId, orgId, role } = session.user;

  const access = await requireTaskAccess(taskId, orgId, actorId, role);
  if (!access.ok) return access;

  const result = await reopenTask(orgId, taskId);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

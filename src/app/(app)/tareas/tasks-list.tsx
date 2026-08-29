"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { TASK_STATUS_LABEL, taskStatus, type TaskStatus } from "@/lib/tasks";
import { completeTaskAction, moveTaskAction, reopenTaskAction } from "./actions";
import { TaskCardBody, type TaskCardData } from "./task-card";
import { TaskAssignee } from "./task-assignee";

const STATUS_TONE: Record<TaskStatus, "neutral" | "warning" | "good"> = {
  PENDIENTE: "neutral",
  EN_CURSO: "warning",
  HECHA: "good",
};

/**
 * Vista de lista: las mismas tareas del tablero en una columna, ordenadas por
 * urgencia. Existe porque el tablero se lee de un vistazo pero se recorre mal
 * cuando hay muchas — y en móvil, tres columnas no caben.
 */
export function TasksList({
  tasks,
  assignees,
  canReassign,
  readOnly = false,
  emptyTitle,
  emptyDescription,
}: {
  tasks: (TaskCardData & { startedAt: string | null })[];
  assignees: { id: string; name: string }[];
  canReassign: boolean;
  /** El histórico se consulta, no se opera: solo deja reabrir. */
  readOnly?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(result.error ?? "No se pudo actualizar la tarea.");
    });
  }

  if (tasks.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const status = taskStatus({
          startedAt: task.startedAt ? new Date(task.startedAt) : null,
          resolvedAt: task.resolvedAt ? new Date(task.resolvedAt) : null,
        });
        return (
          <li key={task.id} className="rounded-card border border-brand-border bg-brand-card shadow-card p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Badge tone={STATUS_TONE[status]}>{TASK_STATUS_LABEL[status]}</Badge>
              {status === "HECHA" && task.resolvedAt && (
                <span className="text-[11px] text-faint">
                  Completada el {new Date(task.resolvedAt).toLocaleDateString("es-ES")}
                </span>
              )}
            </div>

            <TaskCardBody task={task}>
              <span className="flex items-center gap-2 shrink-0">
                {status === "HECHA" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => reopenTaskAction(task.id), "Tarea reabierta")}
                    className="text-[11px] font-bold uppercase text-brand-muted hover:text-brand-text disabled:opacity-50"
                  >
                    Reabrir
                  </button>
                ) : (
                  !readOnly && (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => moveTaskAction(task.id, status === "EN_CURSO" ? "PENDIENTE" : "EN_CURSO"),
                            status === "EN_CURSO" ? "Devuelta a pendiente" : "Tarea en curso"
                          )
                        }
                        className="text-[11px] font-bold uppercase text-brand-muted hover:text-brand-text disabled:opacity-50"
                      >
                        {status === "EN_CURSO" ? "Pausar" : "Empezar"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => completeTaskAction(task.id), "Tarea completada")}
                        className="text-[11px] font-bold uppercase text-brand-text hover:underline disabled:opacity-50"
                      >
                        Completar
                      </button>
                    </>
                  )
                )}
              </span>
            </TaskCardBody>

            {canReassign && status !== "HECHA" && (
              <div className="mt-2">
                <TaskAssignee
                  taskId={task.id}
                  taskTitle={task.title}
                  assignees={assignees}
                  currentUserId={task.recipientUserId}
                  currentName={task.recipientName}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

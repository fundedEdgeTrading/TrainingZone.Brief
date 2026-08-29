"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { usePointerDrag } from "@/lib/use-pointer-drag";
import { DONE_COLUMN_WINDOW_HOURS, TASK_STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/tasks";
import { completeTaskAction, moveTaskAction, reopenTaskAction } from "./actions";
import { TaskCardBody, type TaskCardData } from "./task-card";
import { TaskAssignee } from "./task-assignee";

const COLUMN_DOT: Record<TaskStatus, string> = {
  PENDIENTE: "var(--color-brand-muted)",
  EN_CURSO: "var(--color-warning)",
  HECHA: "var(--color-good)",
};

const COLUMN_HINT: Record<TaskStatus, string> = {
  PENDIENTE: "Sin empezar",
  EN_CURSO: "En marcha",
  HECHA: `Últimas ${DONE_COLUMN_WINDOW_HOURS} h`,
};

/**
 * Tablero de tareas. Las tarjetas se arrastran entre las tres columnas con el
 * mismo gesto que el embudo de leads (ratón y táctil, `usePointerDrag`).
 *
 * "Hecha" no es un estado que se escriba: soltar ahí llama a la acción de
 * completar, que pasa por `resolveNotification` como la campana. Por eso la
 * columna solo enseña lo cerrado en las últimas horas —lo demás se consulta en
 * el histórico— y sacar una tarjeta de ella la reabre.
 */
export function TasksBoard({
  tasksByStatus,
  assignees,
  canReassign,
}: {
  tasksByStatus: Record<TaskStatus, TaskCardData[]>;
  assignees: { id: string; name: string }[];
  canReassign: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  // En táctil el dedo tapa la tarjeta original: el fantasma que sigue al puntero
  // es la única pista de qué se está moviendo.
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number } | null>(null);
  const justDraggedRef = useRef(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (success) toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "No se pudo actualizar la tarea.");
      }
    });
  }

  function handleDrop(taskId: string, from: TaskStatus, to: TaskStatus) {
    if (from === to) return;
    if (to === "HECHA") return run(() => completeTaskAction(taskId), "Tarea completada");
    if (from === "HECHA") return run(() => reopenTaskAction(taskId), "Tarea reabierta");
    run(() => moveTaskAction(taskId, to));
  }

  /** Columna bajo el puntero: el fantasma lleva `pointer-events:none` para no taparla. */
  function columnAt(x: number, y: number): TaskStatus | null {
    const el = document.elementFromPoint(x, y)?.closest("[data-task-column]");
    return (el?.getAttribute("data-task-column") as TaskStatus | undefined) ?? null;
  }

  const drag = usePointerDrag<{ id: string; label: string; from: TaskStatus }>({
    onActivate: (task, p) => {
      setDraggingId(task.id);
      setGhost({ label: task.label, x: p.x, y: p.y });
    },
    onMove: (_task, p) => {
      setGhost((g) => (g ? { ...g, x: p.x, y: p.y } : g));
      setDragOver(columnAt(p.x, p.y));
    },
    onEnd: (task, p, moved) => {
      setDraggingId(null);
      setGhost(null);
      setDragOver(null);
      if (!moved) return;
      justDraggedRef.current = true;
      window.setTimeout(() => (justDraggedRef.current = false), 0);
      const to = columnAt(p.x, p.y);
      if (to) handleDrop(task.id, task.from, to);
    },
    onCancel: () => {
      setDraggingId(null);
      setGhost(null);
      setDragOver(null);
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
      {TASK_STATUSES.map((status) => {
        const items = tasksByStatus[status] ?? [];
        const isOver = dragOver === status;
        return (
          <div
            key={status}
            data-task-column={status}
            className={`rounded-card shadow-card overflow-hidden border transition-colors duration-150 ${
              isOver ? "bg-surface-soft" : "bg-brand-card"
            }`}
            style={{ borderColor: isOver ? COLUMN_DOT[status] : "var(--color-brand-border)" }}
          >
            <div className="px-3.5 py-3 border-b border-brand-border flex items-center gap-2">
              <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: COLUMN_DOT[status] }} />
              <span className="flex-1 font-display font-bold text-[11px] uppercase tracking-[.09em] text-brand-text-2">
                {TASK_STATUS_LABEL[status]}
              </span>
              <span className="text-[10px] uppercase tracking-[.06em] text-faint">{COLUMN_HINT[status]}</span>
              <Badge tone="neutral" dot={false}>
                {items.length}
              </Badge>
            </div>

            <div className="p-2.5 space-y-2 min-h-[120px] max-h-[64vh] overflow-y-auto">
              {items.map((task) => (
                <div
                  key={task.id}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("button, select, [data-no-drag]")) return;
                    drag.start(e, { id: task.id, label: task.title, from: status });
                  }}
                  onClickCapture={(e) => {
                    if (!justDraggedRef.current) return;
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className={`rounded-control border border-brand-border bg-white p-2.5 cursor-grab active:cursor-grabbing hover:shadow-hover hover:border-brand-border-hover transition-[box-shadow,border-color,opacity] duration-200 touch-pan-y select-none [-webkit-touch-callout:none] ${
                    draggingId === task.id ? "opacity-40" : ""
                  }`}
                >
                  <TaskCardBody task={task}>
                    {status === "HECHA" ? (
                      <button
                        type="button"
                        onClick={() => run(() => reopenTaskAction(task.id), "Tarea reabierta")}
                        className="shrink-0 text-[11px] font-bold uppercase text-brand-muted hover:text-brand-text"
                      >
                        Reabrir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => run(() => completeTaskAction(task.id), "Tarea completada")}
                        className="shrink-0 text-[11px] font-bold uppercase text-brand-muted hover:text-brand-text"
                      >
                        Completar
                      </button>
                    )}
                  </TaskCardBody>

                  {canReassign && status !== "HECHA" && (
                    <div className="mt-2" data-no-drag>
                      <TaskAssignee
                        taskId={task.id}
                        taskTitle={task.title}
                        assignees={assignees}
                        currentUserId={task.recipientUserId}
                        currentName={task.recipientName}
                      />
                    </div>
                  )}
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-faint text-center py-6">Vacío</p>}
            </div>
          </div>
        );
      })}

      {ghost && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-control border border-brand-ink bg-white px-3 py-2 text-sm font-semibold text-brand-text shadow-pop max-w-[240px] truncate"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {ghost.label}
        </div>
      )}
    </div>
  );
}

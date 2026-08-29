"use client";

import type { TaskPriority } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { TASK_PRIORITY_LABEL } from "@/lib/tasks";

export type TaskCardData = {
  id: string;
  recipientUserId: string;
  title: string;
  body: string | null;
  category: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  resolvedAt: string | null;
  recipientName: string;
  createdByName: string | null;
};

export const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  ALTA: "critical",
  MEDIA: "warning",
  BAJA: "neutral",
};

const DATE_FMT = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" });

/** Días que faltan (o sobran) hasta la fecha límite, en días naturales. */
function daysUntil(due: Date): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(due);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Solo la fecha, sin juicio sobre si llega tarde. */
export function dueDateText(dueDate: string): string {
  const due = new Date(dueDate);
  return Number.isNaN(due.getTime()) ? "" : DATE_FMT.format(due);
}

export function dueLabel(dueDate: string | null): { text: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const days = daysUntil(due);
  if (days < 0) return { text: `Vencida (${DATE_FMT.format(due)})`, overdue: true };
  if (days === 0) return { text: "Vence hoy", overdue: true };
  if (days === 1) return { text: "Vence mañana", overdue: false };
  return { text: `Vence el ${DATE_FMT.format(due)}`, overdue: false };
}

/**
 * Cuerpo compartido por la tarjeta del tablero y la fila de la lista: las dos
 * vistas enseñan lo mismo (quién la hace, quién la mandó, cuánto corre y cuándo
 * vence) y solo cambia la disposición.
 */
export function TaskCardBody({ task, children }: { task: TaskCardData; children?: React.ReactNode }) {
  // Una tarea ya cerrada no está "vencida": la fecha límite pasa a ser un dato
  // del histórico, no un aviso en rojo sobre algo que ya se hizo.
  const due = task.resolvedAt ? null : dueLabel(task.dueDate);
  const closedDue = task.resolvedAt && task.dueDate ? dueDateText(task.dueDate) : null;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-brand-text">{task.title}</p>
        <Badge tone={PRIORITY_TONE[task.priority]} dot={false} className="shrink-0">
          {TASK_PRIORITY_LABEL[task.priority]}
        </Badge>
      </div>

      {task.body && <p className="text-xs text-brand-text-2 mt-1 line-clamp-3">{task.body}</p>}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {task.category && (
          <span className="rounded-pill bg-tz-sand px-2 py-0.5 text-[11px] font-semibold text-brand-text-2">{task.category}</span>
        )}
        {due && (
          <span
            className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
              due.overdue ? "bg-critical-bg text-critical" : "bg-tz-bone text-brand-text-2"
            }`}
          >
            {due.text}
          </span>
        )}
        {closedDue && (
          <span className="rounded-pill bg-tz-bone px-2 py-0.5 text-[11px] font-semibold text-brand-text-2">
            Fecha límite: {closedDue}
          </span>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-tz-sand flex items-center justify-between gap-2">
        <span className="text-xs text-brand-text-2 min-w-0 truncate">
          {task.recipientName}
          {/* Quién la mandó se conserva al reasignar: es lo que deja claro de
              dónde viene el encargo cuando la tarea pasa por varias manos. */}
          {task.createdByName && <span className="text-faint"> · de {task.createdByName}</span>}
          {!task.createdByName && <span className="text-faint"> · automática</span>}
        </span>
        {children}
      </div>
    </>
  );
}

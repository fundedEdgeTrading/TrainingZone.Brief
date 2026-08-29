import type { TaskPriority } from "@prisma/client";

/**
 * Tareas manuales (F10): la parte que no toca la base de datos. Vive separada
 * de `tasks-queries.ts` porque el tablero, la lista y las tarjetas son
 * componentes de cliente: si las etiquetas y el cálculo del estado vinieran del
 * módulo de consultas, el bundle del navegador se llevaría por delante a
 * `prisma` con ellas.
 *
 * Aquí está, además, la única definición del estado de una tarea.
 */

/**
 * El estado NO vive en una columna: se deriva de las dos marcas de tiempo que
 * ya lleva la fila. Así "Hecha" solo puede significar una cosa —hay
 * `resolvedAt`— y no puede desincronizarse con un `status` que alguien olvide
 * escribir desde la campana o desde el cron.
 */
export type TaskStatus = "PENDIENTE" | "EN_CURSO" | "HECHA";

/** Columnas del tablero, en orden. */
export const TASK_STATUSES: TaskStatus[] = ["PENDIENTE", "EN_CURSO", "HECHA"];

/** Lo que se ve en las vistas activas: "Hecha" solo aparece en el histórico. */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["PENDIENTE", "EN_CURSO"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  HECHA: "Hecha",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

export const TASK_PRIORITIES: TaskPriority[] = ["ALTA", "MEDIA", "BAJA"];

/** Orden de urgencia para listar: primero lo que más corre. */
const PRIORITY_RANK: Record<TaskPriority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

export const MAX_TITLE_LENGTH = 140;
export const MAX_CATEGORY_LENGTH = 40;

/**
 * Ventana de la columna "Hecha" del tablero. Completar una tarea la saca de las
 * vistas activas (RB-TASK-003), pero una tercera columna permanentemente vacía
 * no es una columna: sin nada donde soltar, arrastrar a "Hecha" no se ve que
 * haya funcionado. La columna enseña lo cerrado en el último día y remite al
 * histórico para lo demás, así que ni crece sin fin ni engaña sobre lo que
 * queda por hacer.
 */
export const DONE_COLUMN_WINDOW_HOURS = 24;

/** Valor del eje «Categoría» para las tareas sin categorizar. */
export const NO_CATEGORY = "none";

/** Lo que estas funciones necesitan de una tarea, venga de donde venga. */
export type TaskShape = {
  recipientUserId: string;
  priority: TaskPriority;
  category: string | null;
  dueDate: Date | null;
  startedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

export function taskStatus(task: { startedAt: Date | null; resolvedAt: Date | null }): TaskStatus {
  // `resolvedAt` manda sobre `startedAt`: una tarea que se empezó y se terminó
  // está hecha, no en curso.
  if (task.resolvedAt) return "HECHA";
  return task.startedAt ? "EN_CURSO" : "PENDIENTE";
}

/** Ejes de filtrado del tablero y de la lista. */
export type TaskSelection = { recipientUserId: string[]; status: string[]; priority: string[]; category: string[] };

export const EMPTY_TASK_SELECTION: TaskSelection = { recipientUserId: [], status: [], priority: [], category: [] };

/**
 * Una tarea pasa el filtro cuando encaja en TODOS los ejes con valores (AND
 * entre ejes, OR dentro de cada uno) — mismas reglas que el embudo de leads.
 */
export function matchesTask(task: TaskShape, sel: TaskSelection): boolean {
  if (sel.recipientUserId.length && !sel.recipientUserId.includes(task.recipientUserId)) return false;
  if (sel.status.length && !sel.status.includes(taskStatus(task))) return false;
  if (sel.priority.length && !sel.priority.includes(task.priority)) return false;
  if (sel.category.length && !sel.category.includes(task.category ?? NO_CATEGORY)) return false;
  return true;
}

/** Reparto por columna del tablero, respetando el orden de `TASK_STATUSES`. */
export function groupTasksByStatus<T extends TaskShape>(tasks: T[]): Record<TaskStatus, T[]> {
  const byStatus = { PENDIENTE: [], EN_CURSO: [], HECHA: [] } as Record<TaskStatus, T[]>;
  for (const task of tasks) byStatus[taskStatus(task)].push(task);
  return byStatus;
}

/** Orden de la lista: primero lo más urgente, y dentro, lo que antes vence. */
export function sortTasksByUrgency<T extends TaskShape>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    const dueA = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const dueB = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * Tareas pasadas de fecha. El instante entra como argumento en vez de leerse
 * con `Date.now()` dentro del render: ahí sería una lectura impura
 * (`react-hooks/purity`), y así además la cuenta se prueba sin reloj.
 */
export function countOverdueTasks(tasks: TaskShape[], now: Date): number {
  return tasks.filter((task) => !task.resolvedAt && task.dueDate && task.dueDate.getTime() < now.getTime()).length;
}

/** Categorías ya en uso: alimentan el eje de filtro y las sugerencias del alta. */
export function taskCategories(tasks: TaskShape[]): string[] {
  return [...new Set(tasks.map((t) => t.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es"));
}

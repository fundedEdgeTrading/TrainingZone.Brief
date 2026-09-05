import type { Prisma, TaskPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { MAX_CATEGORY_LENGTH, MAX_TITLE_LENGTH, DONE_COLUMN_WINDOW_HOURS } from "@/lib/tasks";

/**
 * Tareas manuales (F10). El modelo es el de siempre —`Notification` con
 * `kind = TASK`—: una tarea que encarga una persona y una que levanta el motor
 * de reglas son la misma fila, caen en la misma bandeja y se cierran por el
 * mismo sitio (`resolveNotification`). Lo único que añade el alta manual es
 * quién la encarga (`createdByUserId`), en qué cajón va (`category`) y cuánto
 * corre (`priority`).
 *
 * Aquí vive solo el acceso a datos; las etiquetas, el estado derivado y el
 * filtrado están en `lib/tasks.ts`, que no arrastra `prisma` y por tanto puede
 * importarse desde el tablero y las tarjetas (componentes de cliente).
 *
 * Este módulo NO toca la agenda de sesiones (`src/app/(app)/agenda/`): son dos
 * calendarios distintos y mezclarlos convertiría el tablero en una segunda
 * agenda peor. `dueDate` queda como única fecha de la tarea, que es lo que
 * necesitará una vista de calendario cuando se añada: no hará falta rediseñar
 * datos, solo leer el mismo campo por semanas.
 */

export type TaskWriteResult = { ok: true; taskId: string } | { ok: false; error: string };
export type TaskActionResult = { ok: true } | { ok: false; error: string };

/**
 * Quién puede recibir una tarea: cualquier persona del equipo en activo de la
 * organización. Los socios quedan fuera —una tarea es trabajo interno, y el
 * portal del socio no tiene bandeja donde leerla— igual que quien está de baja
 * de plantilla (RB-RRHH-014), que no debe poder recibir nada nuevo, y que el
 * soporte de plataforma, que no es del equipo del gimnasio.
 */
const ASSIGNABLE: Prisma.UserWhereInput = { role: { notIn: ["MEMBER", "PLATFORM_ADMIN"] }, deactivatedAt: null };

/**
 * `centerIds`: ámbito de centro (center-scope.ts) de quien pregunta.
 * `undefined` = dirección de organización, sin restricción. Sin esto, el
 * selector "Asignar a" ofrecía a todo el equipo de la organización, y un
 * director de un centro podía repartir trabajo a personal de otro.
 */
export async function listAssignableUsers(orgId: string, centerIds?: string[]) {
  return prisma.user.findMany({
    where: {
      orgId,
      ...ASSIGNABLE,
      ...(centerIds !== undefined
        ? { OR: [{ centerId: { in: centerIds } }, { centerMemberships: { some: { centerId: { in: centerIds } } } }] }
        : {}),
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

async function assertAssignable(orgId: string, userId: string) {
  if (!userId) return "Elige a quién se le asigna la tarea.";
  const user = await prisma.user.findFirst({ where: { id: userId, orgId, ...ASSIGNABLE }, select: { id: true } });
  return user ? null : "Esa persona no está en el equipo de tu organización.";
}

export type CreateTaskInput = {
  orgId: string;
  /** Quién la manda. Se conserva aunque después se reasigne (RB-TASK-002). */
  createdByUserId: string;
  recipientUserId: string;
  title: string;
  body?: string | null;
  category?: string | null;
  priority?: TaskPriority;
  dueDate?: Date | null;
};

export async function createManualTask(input: CreateTaskInput): Promise<TaskWriteResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "La tarea necesita un texto." };
  if (title.length > MAX_TITLE_LENGTH) return { ok: false, error: `El texto no puede pasar de ${MAX_TITLE_LENGTH} caracteres.` };

  const category = input.category?.trim() || null;
  if (category && category.length > MAX_CATEGORY_LENGTH) {
    return { ok: false, error: `La categoría no puede pasar de ${MAX_CATEGORY_LENGTH} caracteres.` };
  }

  if (input.dueDate && Number.isNaN(input.dueDate.getTime())) return { ok: false, error: "La fecha límite no es válida." };

  const invalidRecipient = await assertAssignable(input.orgId, input.recipientUserId);
  if (invalidRecipient) return { ok: false, error: invalidRecipient };

  // Se crea por el motor compartido y no con un `prisma.notification.create`
  // suelto: así una tarea manual entra en la bandeja exactamente igual que una
  // automática. `createNotificationOnce` NO sirve aquí: la deduplicación por
  // entidad es para las reglas, y dos tareas manuales con el mismo texto son
  // dos encargos distintos.
  const created = await createNotification({
    orgId: input.orgId,
    recipientUserId: input.recipientUserId,
    createdByUserId: input.createdByUserId,
    kind: "TASK",
    title,
    body: input.body?.trim() || undefined,
    category: category ?? undefined,
    priority: input.priority ?? "MEDIA",
    dueDate: input.dueDate ?? undefined,
  });

  return { ok: true, taskId: created.id };
}

/**
 * Reasignación (RB-TASK-002): cambia quién hace la tarea, nunca quién la
 * encargó. `createdByUserId` no se toca a propósito — es lo que deja claro de
 * quién viene el encargo cuando pasa por tres manos.
 */
export async function reassignTask(orgId: string, taskId: string, recipientUserId: string): Promise<TaskActionResult> {
  const task = await prisma.notification.findFirst({
    where: { id: taskId, orgId, kind: "TASK" },
    select: { id: true, recipientUserId: true, resolvedAt: true },
  });
  if (!task) return { ok: false, error: "Tarea no encontrada." };
  // Reasignar algo ya hecho no encarga trabajo a nadie: solo reescribe el
  // histórico y le cuelga a otra persona algo que no hizo.
  if (task.resolvedAt) return { ok: false, error: "Una tarea completada ya no se puede reasignar." };
  if (task.recipientUserId === recipientUserId) return { ok: true };

  const invalidRecipient = await assertAssignable(orgId, recipientUserId);
  if (invalidRecipient) return { ok: false, error: invalidRecipient };

  await prisma.notification.update({ where: { id: taskId }, data: { recipientUserId } });
  return { ok: true };
}

/**
 * Mover una tarjeta entre las dos columnas abiertas del tablero. "Hecha" no
 * entra aquí: se llega por `resolveNotification`, que es el único camino a
 * completada y el que comparten la campana y el motor de reglas.
 */
export async function setTaskProgress(
  orgId: string,
  taskId: string,
  status: "PENDIENTE" | "EN_CURSO"
): Promise<TaskActionResult> {
  const task = await prisma.notification.findFirst({
    where: { id: taskId, orgId, kind: "TASK" },
    select: { id: true, resolvedAt: true },
  });
  if (!task) return { ok: false, error: "Tarea no encontrada." };
  if (task.resolvedAt) return { ok: false, error: "Una tarea completada ya no se puede mover; reábrela desde el histórico." };

  await prisma.notification.update({
    where: { id: taskId },
    data: { startedAt: status === "EN_CURSO" ? new Date() : null },
  });
  return { ok: true };
}

/** Devuelve una tarea del histórico a la bandeja activa, en "Pendiente". */
export async function reopenTask(orgId: string, taskId: string): Promise<TaskActionResult> {
  const task = await prisma.notification.findFirst({
    where: { id: taskId, orgId, kind: "TASK" },
    select: { id: true, resolvedAt: true },
  });
  if (!task) return { ok: false, error: "Tarea no encontrada." };
  if (!task.resolvedAt) return { ok: true };
  await prisma.notification.update({ where: { id: taskId }, data: { resolvedAt: null, startedAt: null } });
  return { ok: true };
}

const TASK_SELECT = {
  id: true,
  title: true,
  body: true,
  category: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  resolvedAt: true,
  createdAt: true,
  recipientUserId: true,
  createdByUserId: true,
  recipient: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.NotificationSelect;

export type TaskRow = Prisma.NotificationGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Qué conjunto de tareas se pide:
 * - `activas`: lo que queda por hacer (las dos columnas abiertas y la lista).
 * - `recien-hechas`: la columna "Hecha" del tablero, acotada a la ventana.
 * - `historico`: todo lo completado, sin ventana.
 */
export type TaskScope = "activas" | "recien-hechas" | "historico";

function scopeWhere(scope: TaskScope): Prisma.NotificationWhereInput {
  if (scope === "activas") return { resolvedAt: null };
  if (scope === "historico") return { resolvedAt: { not: null } };
  return { resolvedAt: { gte: new Date(Date.now() - DONE_COLUMN_WINDOW_HOURS * 60 * 60 * 1000) } };
}

function scopeOrder(scope: TaskScope): Prisma.NotificationOrderByWithRelationInput[] {
  // Lo cerrado interesa por lo último; lo abierto, por lo que vence antes. Una
  // tarea sin fecha límite no es más urgente que una con ella, así que las
  // nulas van al final en vez de encabezar la lista.
  if (scope === "activas") return [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  return [{ resolvedAt: "desc" }];
}

/**
 * Tareas manuales y automáticas de la organización, para el ámbito pedido. Solo
 * `kind = TASK`: las notificaciones de aviso (ALERT/INFO) viven en la campana y
 * no son trabajo que repartir.
 */
export async function listTasks(
  orgId: string,
  opts: { scope?: TaskScope; recipientUserId?: string; q?: string; centerIds?: string[] } = {}
): Promise<TaskRow[]> {
  const scope = opts.scope ?? "activas";
  // La busqueda va a la consulta y los ejes de la barra se resuelven en
  // pantalla (igual que el embudo de leads): asi los recuentos por opcion se
  // calculan sobre el mismo conjunto que se esta mirando.
  const q = opts.q?.trim();
  return prisma.notification.findMany({
    where: {
      orgId,
      kind: "TASK",
      recipientUserId: opts.recipientUserId,
      // Ámbito de centro (center-scope.ts): dirección de un centro solo ve el
      // tablero de sus centros, no el de toda la organización.
      ...(opts.centerIds !== undefined
        ? {
            recipient: {
              OR: [{ centerId: { in: opts.centerIds } }, { centerMemberships: { some: { centerId: { in: opts.centerIds } } } }],
            },
          }
        : {}),
      ...scopeWhere(scope),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { body: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: TASK_SELECT,
    orderBy: scopeOrder(scope),
    take: 300,
  });
}

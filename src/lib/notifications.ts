import { prisma } from "@/lib/prisma";
import type { NotificationKind, TaskPriority } from "@prisma/client";
import {
  AUTO_TASK_CAP_ENTITY,
  AUTO_TASK_RULES,
  autoTaskRuleFor,
  autoTaskWeekLabel,
  autoTaskWeekStart,
} from "@/lib/tasks";

/**
 * Motor de notificaciones/tareas (F10, transversal). Punto único de creación y
 * resolución para que todas las reglas temporales (24h sin responsable, pocas
 * sesiones programadas, valoración pendiente, oferta sugerida, estancamiento...)
 * compartan el mismo modelo y la misma bandeja de entrada.
 */
export async function createNotification(input: {
  orgId: string;
  recipientUserId: string;
  /**
   * Quién la encarga. Las reglas temporales lo dejan vacío a propósito: detrás
   * de ellas no hay una persona, y firmarlas con el usuario del cron sería
   * mentir sobre quién pidió el trabajo. Solo lo rellena el alta manual
   * (lib/tasks-queries.ts), y la reasignación no lo toca.
   */
  createdByUserId?: string;
  kind?: NotificationKind;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  category?: string;
  priority?: TaskPriority;
  dueDate?: Date;
}) {
  return prisma.notification.create({
    data: {
      orgId: input.orgId,
      recipientUserId: input.recipientUserId,
      createdByUserId: input.createdByUserId,
      kind: input.kind ?? "TASK",
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      priority: input.priority ?? "MEDIA",
      dueDate: input.dueDate,
    },
  });
}

/**
 * Resultado de una creación deduplicada. Es una unión y no una fila a secas
 * porque ahora hay tres desenlaces y el de en medio importa: `capped` es la
 * tarea que el tope ha dejado para más adelante, y una regla que cuente
 * «creadas» tiene que poder distinguirla de una que ya existía.
 */
export type OnceResult =
  | { status: "created"; id: string }
  | { status: "existing"; id: string }
  | { status: "capped"; recipientUserId: string };

/**
 * Evita duplicar la misma tarea abierta de la MISMA REGLA (E14-11).
 *
 * La clave era `(orgId, recipientUserId, entityType, entityId)` y el
 * `entityType` de dos reglas distintas podía ser el mismo `"Member"`: entonces
 * la segunda regla no escribía nada y no lo decía. Ahora:
 *
 * - **la regla forma parte de la clave**, porque cada una tiene su `entityType`
 *   propio en el catálogo de `lib/tasks.ts` (el patrón que ya se había
 *   inventado `no-show-alerts.ts` para escaparse de esto);
 * - **`kind` también entra en la clave**: un aviso de la campana (`ALERT`) y un
 *   encargo del tablero (`TASK`) no son la misma cosa y no deben comerse el uno
 *   al otro, aunque hablen de la misma entidad. Es lo que separa hoy el «mensaje
 *   nuevo de un socio» (TASK) del aviso de impago (ALERT), que comparten
 *   `entityType = "Member"` y no son de ninguna regla del catálogo;
 * - una regla de **audiencia `"centro"`** deduplica en TODA la organización, no
 *   por destinatario: es trabajo del centro y basta con que lo tenga una
 *   persona de dirección, que además puede reasignarlo desde el tablero. Eso es
 *   lo que corta el abanico —siete direcciones, siete copias idénticas— sin
 *   inventarse una `Notification` sin destinatario, que el modelo no admite.
 */
export async function createNotificationOnce(input: Parameters<typeof createNotification>[0]): Promise<OnceResult> {
  const rule = autoTaskRuleFor(input.entityType);
  const orgWide = rule !== null && AUTO_TASK_RULES[rule].audience === "centro";

  const existing = await prisma.notification.findFirst({
    where: {
      orgId: input.orgId,
      // La tarea de centro la busca en toda la organización: si ya la tiene
      // alguien de dirección, no se abre una segunda para el de al lado.
      recipientUserId: orgWide ? undefined : input.recipientUserId,
      kind: input.kind ?? "TASK",
      entityType: input.entityType,
      entityId: input.entityId,
      resolvedAt: null,
    },
    select: { id: true },
  });
  if (existing) return { status: "existing", id: existing.id };

  const capped = await isOverWeeklyCap(input);
  if (capped) {
    await notifyWeeklyCapReached(input.orgId, input.recipientUserId);
    return { status: "capped", recipientUserId: input.recipientUserId };
  }

  const created = await createNotification(input);
  return { status: "created", id: created.id };
}

/* ------------------------------------------------------------------------- *
 * E14-12 · Tope semanal de tareas automáticas
 * ------------------------------------------------------------------------- */

/**
 * Qué cuenta para el tope: lo que escribe el MOTOR en el tablero de una
 * persona durante la semana en curso.
 *
 * - Solo `createdByUserId = null`. Lo que una persona encarga a otra no se
 *   limita jamás: el tope protege de la máquina, no del equipo.
 * - Solo `kind = "TASK"`. Un `ALERT` es un aviso de la campana, no trabajo
 *   repartido —y entre los `ALERT` está «una regla automática está fallando»,
 *   que es justo el que nunca puede quedarse sin escribir.
 * - El propio aviso del tope no se cuenta a sí mismo.
 * - Cuentan las CREADAS en la semana, resueltas o no: el tope mide cuánto pide
 *   la máquina, no cuánto queda por hacer. Si contara solo lo abierto, cerrar
 *   tareas abriría hueco para que la misma pasada del cron volviera a llenarlo,
 *   que es exactamente el aluvión del que se queja el encargo.
 */
async function weeklyAutoTaskCount(orgId: string, recipientUserId: string, now: Date): Promise<number> {
  return prisma.notification.count({
    where: {
      orgId,
      recipientUserId,
      kind: "TASK",
      createdByUserId: null,
      entityType: { not: AUTO_TASK_CAP_ENTITY },
      createdAt: { gte: autoTaskWeekStart(now) },
    },
  });
}

/** Tope de la organización. Columna `Organization.autoTaskWeeklyCapPerUser`. */
async function weeklyCapFor(orgId: string): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { autoTaskWeeklyCapPerUser: true },
  });
  return org?.autoTaskWeeklyCapPerUser ?? 15;
}

async function isOverWeeklyCap(input: Parameters<typeof createNotification>[0]): Promise<boolean> {
  // El tope es de tareas automáticas: ni las manuales ni los avisos de campana
  // pasan por aquí, y el aviso del propio tope tampoco.
  if (input.createdByUserId) return false;
  if ((input.kind ?? "TASK") !== "TASK") return false;
  if (input.entityType === AUTO_TASK_CAP_ENTITY) return false;

  const [cap, used] = await Promise.all([
    weeklyCapFor(input.orgId),
    weeklyAutoTaskCount(input.orgId, input.recipientUserId, new Date()),
  ]);
  return used >= cap;
}

/**
 * Qué pasa al alcanzar el tope, dicho de una vez: **no se descarta nada y no se
 * pierde nada**.
 *
 * Las reglas del motor son detectores sobre el estado de HOY, no una cola de
 * mensajes: vuelven a pasar cada noche y vuelven a mirar. Una tarea que el tope
 * no deja escribir esta semana no se ha perdido — la situación que la provoca
 * (el bono que se acaba, el calendario vacío) sigue ahí y la próxima pasada con
 * hueco la escribe. Por eso NO hace falta una cola de pendientes, que sería una
 * segunda fuente de verdad sobre algo que ya está en los datos.
 *
 * Lo que sí hace falta es que se sepa, y por eso el tope escribe **una sola
 * tarea resumen** por persona: un tope invisible es un fallo que nadie reporta.
 * Va en `ALTA` porque su trabajo es que alguien cierre bandeja, y se resuelve
 * como cualquier otra. Mientras esté abierta no se escribe otra; al cerrarla,
 * si el tope sigue actuando, vuelve — que es lo honesto.
 */
async function notifyWeeklyCapReached(orgId: string, recipientUserId: string): Promise<void> {
  const now = new Date();
  const cap = await weeklyCapFor(orgId);
  await createNotificationOnce({
    orgId,
    recipientUserId,
    kind: "TASK",
    priority: "ALTA",
    title: `Tope semanal de tareas automáticas alcanzado (${cap})`,
    body:
      `Las reglas del centro han dejado de crearte tareas esta semana (${autoTaskWeekLabel(now)}). ` +
      "No se ha descartado nada: en cuanto cierres las abiertas, o el lunes que viene, el motor vuelve a escribir " +
      "las situaciones que sigan sin atender. El tope lo fija la organización (autoTaskWeeklyCapPerUser).",
    entityType: AUTO_TASK_CAP_ENTITY,
    entityId: recipientUserId,
  });
}

/**
 * Elige a QUIÉN se le encarga una tarea de centro entre los candidatos de
 * dirección (E14-11, abanico).
 *
 * `Notification.recipientUserId` es obligatorio, así que una tarea «sin dueño,
 * que la coja quien pueda» no cabe en el modelo. La alternativa que sí cabe es
 * esta: **un dueño, elegido con criterio, y el tablero de dirección deja
 * reasignarla** —`canAssignTasks` ya ve y reparte las tareas de todo su ámbito—.
 *
 * El criterio es el reparto: de quienes todavía tienen hueco esta semana, el que
 * menos tareas automáticas lleve; a igualdad, el primero por id, para que dos
 * pasadas seguidas no bailen. Así el tope deja de ser un muro y pasa a ser un
 * reparto: con siete direcciones, el trabajo cae donde hay sitio en vez de
 * amontonarse sobre la misma persona.
 *
 * Si NADIE tiene hueco se devuelve igualmente al menos cargado, y no `null`:
 * decidir *si* la tarea se escribe es del motor (`createNotificationOnce`), que
 * es el único que sabe que el tope solo alcanza a `kind = "TASK"` —un `ALERT`
 * de campana no se limita nunca—. `null` significa exactamente una cosa: que no
 * hay ninguna persona de dirección a quien encargárselo.
 */
export async function pickCenterTaskRecipient(orgId: string, candidateUserIds: string[]): Promise<string | null> {
  if (candidateUserIds.length === 0) return null;
  const now = new Date();
  const cap = await weeklyCapFor(orgId);

  const loads = await Promise.all(
    [...candidateUserIds].sort().map(async (userId) => ({ userId, used: await weeklyAutoTaskCount(orgId, userId, now) }))
  );
  const withRoom = loads.filter((l) => l.used < cap);
  const pool = withRoom.length > 0 ? withRoom : loads;

  return pool.reduce((best, candidate) => (candidate.used < best.used ? candidate : best)).userId;
}

export async function listNotificationsForUser(orgId: string, userId: string, opts: { includeResolved?: boolean } = {}) {
  return prisma.notification.findMany({
    where: {
      orgId,
      recipientUserId: userId,
      resolvedAt: opts.includeResolved ? undefined : null,
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function countUnresolvedForUser(orgId: string, userId: string) {
  return prisma.notification.count({ where: { orgId, recipientUserId: userId, resolvedAt: null } });
}

/**
 * Único camino a "completada", lo mismo si la tarea la levantó una regla que si
 * la encargó una persona: la campana, el tablero y la lista pasan todos por
 * aquí. Al quedar `resolvedAt` escrito, la tarea sale de las vistas activas y
 * pasa a consultarse solo desde el histórico.
 *
 * `anyRecipient` abre la resolución a quien reparte trabajo (dirección,
 * Entrenador Admin) sobre tareas de otra persona; sin él sigue mandando la
 * regla de siempre —solo el destinatario cierra lo suyo—, que es lo que
 * necesita la campana.
 */
export async function resolveNotification(
  orgId: string,
  userId: string,
  notificationId: string,
  opts: { anyRecipient?: boolean } = {}
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, orgId, recipientUserId: opts.anyRecipient ? undefined : userId },
    select: { id: true },
  });
  if (!notification) return { ok: false as const };
  await prisma.notification.update({ where: { id: notificationId }, data: { resolvedAt: new Date() } });
  return { ok: true as const };
}

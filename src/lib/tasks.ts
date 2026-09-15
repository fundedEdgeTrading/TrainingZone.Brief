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

/* ------------------------------------------------------------------------- *
 * E14-12 · Tope semanal de tareas automáticas
 * ------------------------------------------------------------------------- */

/**
 * Entidad del aviso del tope. Va aparte de las reglas que lo provocan porque no
 * habla de un socio: habla de la bandeja de una persona.
 */
export const AUTO_TASK_CAP_ENTITY = "AutoTaskWeeklyCap";

/**
 * Semana del tope: de lunes a domingo, en la hora del servidor.
 *
 * Lunes y no «los últimos siete días» porque el tope se explica en la pantalla
 * («llevas 15 de 15 esta semana») y una ventana deslizante no se explica: cada
 * persona tendría la suya y nadie sabría cuándo vuelve a haber sitio.
 */
export function autoTaskWeekStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // getDay(): 0 = domingo. El lunes de la semana del domingo es seis días antes.
  const backToMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - backToMonday);
  return start;
}

/** Etiqueta legible de la semana, para el cuerpo del aviso del tope. */
export function autoTaskWeekLabel(now: Date): string {
  const start = autoTaskWeekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/* ------------------------------------------------------------------------- *
 * E14-11 · Catálogo de reglas automáticas
 * ------------------------------------------------------------------------- */

/**
 * Las reglas del motor, con su espacio de nombres propio.
 *
 * `createNotificationOnce` deduplica por `(orgId, recipientUserId, entityType,
 * entityId, resolvedAt: null)`. Mientras dos reglas distintas escribieran
 * `entityType = "Member"` y `entityId = member.id`, la segunda NO se creaba: si
 * un socio ya tenía abierta la de «pocas sesiones programadas», la de «le
 * quedan 2 sesiones del bono» —la que más vende— se la comía el deduplicador en
 * silencio. Medido sobre los datos de demo: de 12 socios con el bono acabándose,
 * 6 no tenían su tarea, y NINGÚN socio tenía las dos.
 *
 * El arreglo es el que ya había inventado `no-show-alerts.ts` para escaparse del
 * mismo problema: **un `entityType` por regla**. Aquí deja de ser un truco
 * suelto y pasa a ser el catálogo, para que la próxima regla no tenga que
 * redescubrirlo. El `entityId` sigue siendo el id de la entidad (el socio, el
 * lead...), así que el enlace de la campana no cambia
 * (`notification-routes.ts`).
 *
 * Este módulo NO importa `prisma`: la pantalla de tareas necesita los rótulos
 * para agrupar y es un componente de cliente.
 */
export type AutoTaskAudience =
  /**
   * Trabajo del CENTRO: da igual quién de dirección lo coja, pero sobra que lo
   * cojan todos. Una sola tarea abierta por (regla, entidad) en toda la
   * organización, y quien reparte trabajo la ve y la reasigna desde el tablero.
   */
  | "centro"
  /** Trabajo de UNA persona concreta (el socio, su entrenador): una por destinatario. */
  | "persona";

export type AutoTaskRule = {
  /** Espacio de nombres de deduplicación. Único: dos reglas nunca lo comparten. */
  entityType: string;
  /** Rótulo de la tarjeta agrupada. */
  label: string;
  audience: AutoTaskAudience;
};

/**
 * Cambiar `audience` de una regla a `"centro"` deja de repartir N copias sin
 * tocar el fichero de la regla: el motor lo lee de aquí. Las cuatro reglas
 * comerciales sobre el socio ya están giradas (son las del encargo del
 * 15-09-2026); las demás se quedan como estaban hoy —repetidas por
 * destinatario— porque sus ficheros son de otras pistas y girarlas sin
 * avisarles cambiaría a quién le llega su trabajo. La palanca queda puesta y
 * dicha: `docs/hu/M3-decisiones-motor-tareas.md`.
 */
export const AUTO_TASK_RULES = {
  fewSessionsScheduled: {
    entityType: "MemberFewSessionsScheduled",
    label: "Pocas sesiones programadas",
    audience: "centro",
  },
  lowPackBalance: { entityType: "MemberLowPackBalance", label: "Bono acabándose", audience: "centro" },
  stallRisk: { entityType: "MemberStallRisk", label: "Riesgo de estancamiento", audience: "centro" },
  /**
   * `"persona"` y no `"centro"` aunque tenga el mismo abanico: E1-07 fijó por
   * test QUIÉNES tienen derecho a este aviso (dirección de organización más la
   * del centro donde de hecho entrena el socio), y dejar una sola copia lo
   * convierte en «quién de ellos lo recibió». Es una decisión de
   * `no-show-alerts.ts`, que no es de esta pista. Ver
   * `docs/hu/M3-decisiones-motor-tareas.md`.
   */
  noShowStreak: { entityType: "MemberNoShowStreak", label: "Faltas seguidas sin avisar", audience: "persona" },

  // Reglas de otras pistas. Se catalogan para que la pantalla sepa agruparlas y
  // para que el script de limpieza pueda informar por regla, pero conservan el
  // reparto que tienen hoy.
  leadWithoutOwner: { entityType: "Lead", label: "Lead sin responsable", audience: "persona" },
  clientFeedback: { entityType: "ClientFeedbackPrompt", label: "Cómo lo llevas", audience: "persona" },
  followUp: { entityType: "FeedbackFollowUp", label: "Seguimiento 1:1", audience: "persona" },
  selfAssessmentPrompt: { entityType: "SelfAssessmentPrompt", label: "¿Cómo va tu objetivo?", audience: "persona" },
  trainerRatingPrompt: { entityType: "TrainerRatingPrompt", label: "Valora a tu entrenador", audience: "persona" },
  dispute: { entityType: "PaymentDispute", label: "Disputa de cobro", audience: "persona" },
  jobFailure: { entityType: "JobFailure", label: "Regla automática fallando", audience: "persona" },
  /** El aviso del propio tope (E14-12). Nunca se limita a sí mismo. */
  weeklyCap: { entityType: AUTO_TASK_CAP_ENTITY, label: "Tope semanal alcanzado", audience: "persona" },
} as const satisfies Record<string, AutoTaskRule>;

export type AutoTaskRuleKey = keyof typeof AUTO_TASK_RULES;

export const AUTO_TASK_RULE_KEYS = Object.keys(AUTO_TASK_RULES) as AutoTaskRuleKey[];

const RULE_BY_ENTITY_TYPE = new Map<string, AutoTaskRuleKey>(
  AUTO_TASK_RULE_KEYS.map((key) => [AUTO_TASK_RULES[key].entityType, key])
);

/** La regla a la que pertenece una tarea, o `null` si su entidad no es de ninguna. */
export function autoTaskRuleFor(entityType: string | null | undefined): AutoTaskRuleKey | null {
  return entityType ? RULE_BY_ENTITY_TYPE.get(entityType) ?? null : null;
}

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

/** Lo que además necesita la agrupación por regla (E14-13). */
export type GroupableTask = {
  id: string;
  entityType: string | null;
  /** Null = la levantó el motor. Una tarea que encarga una persona no se agrupa. */
  createdByUserId: string | null;
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

/* ------------------------------------------------------------------------- *
 * E14-13 · Agrupación por regla
 * ------------------------------------------------------------------------- */

/**
 * Un bloque de la pantalla: o una tarea suelta, o varias de la misma regla.
 *
 * La agrupación es de PRESENTACIÓN y nada más. No hay columna de estado que
 * mantener, no hay fila «grupo» en la base de datos y `resolveNotification`
 * sigue siendo el único camino a «Hecha»: cerrar la tarjeta agrupada cierra sus
 * tareas una a una por ese mismo camino, y el contador es sencillamente cuántas
 * quedan. Con una segunda fuente de verdad del estado, la campana y el cron
 * —que no saben nada de grupos— la dejarían desfasada al primer cierre.
 */
export type TaskGroup<T> = {
  /** Estable entre repintados: la regla, o el id de la tarea suelta. */
  key: string;
  rule: AutoTaskRuleKey | null;
  label: string | null;
  tasks: T[];
};

/**
 * Reparte las tareas en bloques conservando el orden de entrada: un grupo ocupa
 * el sitio de su primera tarea, así que el orden por urgencia de la lista y el
 * de la columna del tablero se mantienen.
 *
 * Solo agrupa lo AUTOMÁTICO y de una regla conocida. Dos encargos de una persona
 * con el mismo texto son dos encargos, no un duplicado (es lo mismo que dice
 * `createManualTask` al no usar la versión deduplicada del motor).
 */
export function groupTasksByRule<T extends GroupableTask>(tasks: T[]): TaskGroup<T>[] {
  const groups: TaskGroup<T>[] = [];
  const byRule = new Map<AutoTaskRuleKey, TaskGroup<T>>();

  for (const task of tasks) {
    const rule = task.createdByUserId === null ? autoTaskRuleFor(task.entityType) : null;
    if (!rule) {
      groups.push({ key: task.id, rule: null, label: null, tasks: [task] });
      continue;
    }
    const existing = byRule.get(rule);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    const group: TaskGroup<T> = { key: `rule:${rule}`, rule, label: AUTO_TASK_RULES[rule].label, tasks: [task] };
    byRule.set(rule, group);
    groups.push(group);
  }

  return groups;
}

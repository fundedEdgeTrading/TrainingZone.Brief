import type {
  FlowActionType,
  FlowBranch,
  FlowConditionType,
  FlowGoalKind,
  FlowStatus,
  FlowTriggerType,
  PlanType,
} from "@prisma/client";

/**
 * E2 · Catálogo de las cuatro piezas. PURO: ni Prisma ni `next/*`, porque lo
 * importan el motor (servidor) y el editor (componente de cliente).
 *
 * LA ESTRUCTURA ES FIJA y el editor no debe permitir nada más:
 *
 *     DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN
 *
 * Los catálogos son enums de Prisma —cerrados a propósito— y aquí viven sus
 * rótulos y, lo que de verdad importa, DE DÓNDE SALE CADA SEÑAL. Los
 * disparadores NO se recalculan: se cablean a lo que ya existe. Escribirlo aquí
 * evita que el próximo flujo se invente un segundo criterio para «lleva dos
 * semanas sin venir» y acabe contradiciendo a la etiqueta de E1.
 */

/* ------------------------------------------------------------------------- *
 * DISPARADOR
 * ------------------------------------------------------------------------- */

export const FLOW_TRIGGER_TYPES: FlowTriggerType[] = [
  "MEMBER_JOINED",
  "FIRST_SESSION_DONE",
  "SESSIONS_ABSENCE",
  "PACK_BALANCE_BELOW",
  "PAYMENT_FAILED",
  "MEMBER_STATE_CHANGED",
  "DATE_ANNIVERSARY",
  "DATE_BIRTHDAY",
  "FORM_ANSWERED",
  "RATING_BELOW",
];

export const FLOW_TRIGGER_LABEL: Record<FlowTriggerType, string> = {
  MEMBER_JOINED: "Alta nueva",
  FIRST_SESSION_DONE: "Primera sesión hecha",
  SESSIONS_ABSENCE: "X sesiones sin venir",
  PACK_BALANCE_BELOW: "El bono baja de N",
  PAYMENT_FAILED: "Recibo fallido",
  MEMBER_STATE_CHANGED: "Cambio de estado",
  DATE_ANNIVERSARY: "Aniversario del alta",
  DATE_BIRTHDAY: "Cumpleaños",
  FORM_ANSWERED: "Formulario respondido",
  RATING_BELOW: "Valoración por debajo de N",
};

/**
 * De dónde sale la señal de cada disparador. Se pinta en el editor al lado del
 * desplegable: quien monta un flujo tiene que poder saber qué le va a meter
 * gente dentro sin abrir el código, y quien mantiene el motor tiene que ver de
 * un vistazo que aquí NO se calcula nada nuevo.
 */
export const FLOW_TRIGGER_SIGNAL: Record<FlowTriggerType, string> = {
  MEMBER_JOINED: "Member.joinedAt — el alta, tal y como la cuenta el listado de socios.",
  FIRST_SESSION_DONE: "La primera reserva ATTENDED del socio (Booking, misma fuente que «última visita»).",
  SESSIONS_ABSENCE:
    "Días desde la última asistencia (lastAttendanceByMember), el mismo dato que la etiqueta «2 semanas sin venir» de E1.",
  PACK_BALANCE_BELOW: "Subscription.sessionsRemaining, la misma condición que runLowPackBalanceRule.",
  PAYMENT_FAILED: "Member.delinquentSince, que escribe el dunning de Stripe (stripe-dunning.ts).",
  MEMBER_STATE_CHANGED: "Member.state, que solo mueve member-lifecycle.ts (M4): un punto único de escritura.",
  DATE_ANNIVERSARY: "Member.joinedAt, en el calendario del centro.",
  DATE_BIRTHDAY: "Member.birthDate, con el mismo criterio de zona y de 29 de febrero que birthday-jobs.ts.",
  FORM_ANSWERED: "MemberFormInvite.completedAt (member-forms.ts, M5).",
  RATING_BELOW: "TrainerRating.score — la valoración que deja el socio a su entrenador.",
};

/**
 * Parámetro numérico de los disparadores que lo llevan («la N»), con su rango.
 * El editor pinta el campo y el servidor lo valida contra esto mismo: una sola
 * definición, no dos que se separen.
 */
export type FlowTriggerNumberSpec = { field: "days" | "threshold" | "score"; label: string; min: number; max: number; fallback: number };

export const FLOW_TRIGGER_NUMBER: Partial<Record<FlowTriggerType, FlowTriggerNumberSpec>> = {
  SESSIONS_ABSENCE: { field: "days", label: "Días sin venir", min: 3, max: 365, fallback: 14 },
  PACK_BALANCE_BELOW: { field: "threshold", label: "Sesiones restantes", min: 1, max: 50, fallback: 2 },
  RATING_BELOW: { field: "score", label: "Puntuación por debajo de", min: 1, max: 10, fallback: 7 },
  DATE_ANNIVERSARY: { field: "days", label: "Meses desde el alta", min: 1, max: 120, fallback: 12 },
};

/** Estados de socio que puede vigilar el disparador «cambio de estado». */
export const FLOW_TRIGGER_STATES = ["ACTIVE", "DELINQUENT", "FROZEN", "CANCELLED"] as const;
export type FlowTriggerState = (typeof FLOW_TRIGGER_STATES)[number];

export const FLOW_TRIGGER_STATE_LABEL: Record<FlowTriggerState, string> = {
  ACTIVE: "Cliente",
  DELINQUENT: "Suspendido (impago)",
  FROZEN: "Congelado",
  CANCELLED: "Excliente",
};

/* ------------------------------------------------------------------------- *
 * CONDICIÓN
 * ------------------------------------------------------------------------- */

export const FLOW_CONDITION_TYPES: FlowConditionType[] = ["CENTER", "PLAN_TYPE", "TAG", "TENURE", "TRAINER"];

export const FLOW_CONDITION_LABEL: Record<FlowConditionType, string> = {
  CENTER: "Centro",
  PLAN_TYPE: "Tipo de plan",
  TAG: "Etiqueta",
  TENURE: "Antigüedad",
  TRAINER: "Entrenador",
};

export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  MONTHLY: "Cuota mensual",
  SESSION_PACK: "Bono de sesiones",
  DROP_IN: "Sesión suelta",
  PERSONAL_TRAINING: "Entrenamiento personal",
  DUO: "Dúo",
  ONLINE: "En línea",
};

/* ------------------------------------------------------------------------- *
 * ACCIÓN
 * ------------------------------------------------------------------------- */

export const FLOW_ACTION_TYPES: FlowActionType[] = [
  "SEND_EMAIL",
  "SEND_FORM",
  "ADD_TAG",
  "REMOVE_TAG",
  "CREATE_TASK",
  "CHANGE_STATE",
  "NOTIFY_DIRECTOR",
];

export const FLOW_ACTION_LABEL: Record<FlowActionType, string> = {
  SEND_EMAIL: "Enviar email",
  SEND_FORM: "Enviar formulario",
  ADD_TAG: "Poner etiqueta",
  REMOVE_TAG: "Quitar etiqueta",
  CREATE_TASK: "Crear tarea a un entrenador",
  CHANGE_STATE: "Cambiar estado",
  NOTIFY_DIRECTOR: "Avisar al director",
};

/**
 * Las acciones que MANDAN CORREO AL SOCIO. Son las únicas que pasan por el
 * punto único de salida y por el tope semanal: poner una etiqueta o abrir una
 * tarea no gasta el cupo de nadie, y tratarlas igual haría que un flujo que
 * solo etiqueta bloqueara el correo de otro.
 */
export const FLOW_EMAIL_ACTIONS: FlowActionType[] = ["SEND_EMAIL", "SEND_FORM"];

export function isEmailAction(action: FlowActionType): boolean {
  return FLOW_EMAIL_ACTIONS.includes(action);
}

/**
 * Estados a los que puede llevar la acción «cambiar estado». La transición NO
 * la escribe este módulo: pasa por `member-lifecycle.ts` (M4), que es el punto
 * único de escritura y el que deja el `AuditLog`.
 */
export const FLOW_ACTION_STATES = ["ACTIVE", "DELINQUENT", "FROZEN", "CANCELLED"] as const;
export type FlowActionState = (typeof FLOW_ACTION_STATES)[number];

/* ------------------------------------------------------------------------- *
 * RAMA
 * ------------------------------------------------------------------------- */

export const FLOW_BRANCHES: FlowBranch[] = ["MAIN", "ON_CLICK", "ON_REPLY", "ON_NO_REPLY"];

/** Las tres ramas de verdad. `MAIN` es el tronco, no una rama que se elija. */
export const FLOW_CONDITIONAL_BRANCHES: FlowBranch[] = ["ON_CLICK", "ON_REPLY", "ON_NO_REPLY"];

/**
 * «SI ABRE» NO EXISTE, y no es un olvido (D-L3-4). Medir aperturas exige un
 * píxel de traza, y con él un CMP con «rechazar todo» al mismo nivel visual que
 * «aceptar todo» EN EL MISMO CAMBIO (AGENTS.md). Negocio pidió «si abre»: se
 * mide EL CLIC, que el enlace es nuestro y no necesita píxel. Las otras dos
 * ramas se quedan igual.
 */
export const FLOW_BRANCH_LABEL: Record<FlowBranch, string> = {
  MAIN: "Tronco",
  ON_CLICK: "Si hace clic",
  ON_REPLY: "Si responde",
  ON_NO_REPLY: "Si no responde en X días",
};

/* ------------------------------------------------------------------------- *
 * ESTADO Y OBJETIVO
 * ------------------------------------------------------------------------- */

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
};

export const FLOW_STATUS_HELP: Record<FlowStatus, string> = {
  DRAFT: "Se ejecuta de verdad, pero TODO envío va al email de pruebas del módulo.",
  ACTIVE: "Corriendo. Escribe a los socios que entren y cumplan las condiciones.",
  PAUSED: "Parado. Lo que estaba encolado no se pierde: se reanuda al activarlo.",
};

/**
 * EL HUECO DEL PANEL POR FLUJO. E2 lo deja tipado y documentado; QUÉ objetivo
 * concreto lleva cada uno de los seis flujos de salida lo decide E3, que es
 * quien los escribe. La definición de cada uno se pinta en la propia pantalla:
 * un embudo cuyo último paso nadie sabe medir es un embudo decorativo.
 */
export const FLOW_GOAL_LABEL: Record<FlowGoalKind, string> = {
  TRAINED_AGAIN: "Volvió a entrenar",
  RENEWED: "Renovó",
  FORM_COMPLETED: "Rellenó el formulario",
  PAYMENT_RECOVERED: "Se recuperó el cobro",
  REFERRAL_SENT: "Recomendó a alguien",
};

export const FLOW_GOAL_DEFINITION: Record<FlowGoalKind, string> = {
  TRAINED_AGAIN: "Una reserva ATTENDED posterior a la fecha del envío.",
  RENEWED: "Una suscripción nueva o un bono recargado después del envío.",
  FORM_COMPLETED: "El formulario del socio, relleno después del envío (MemberFormInvite.completedAt).",
  PAYMENT_RECOVERED: "El impago abierto se cerró después del envío (Member.delinquentSince a null).",
  REFERRAL_SENT: "El socio compartió su código de referido después del envío (R1).",
};

export const FLOW_GOAL_KINDS = Object.keys(FLOW_GOAL_LABEL) as FlowGoalKind[];

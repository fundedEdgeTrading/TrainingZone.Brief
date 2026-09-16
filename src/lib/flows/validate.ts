import type { FlowActionType, FlowBranch, FlowConditionType, FlowGoalKind, FlowTriggerType, PlanType } from "@prisma/client";

import {
  FLOW_ACTION_STATES,
  FLOW_ACTION_TYPES,
  FLOW_BRANCHES,
  FLOW_BRANCH_LABEL,
  FLOW_CONDITIONAL_BRANCHES,
  FLOW_CONDITION_TYPES,
  FLOW_GOAL_LABEL,
  FLOW_TRIGGER_NUMBER,
  FLOW_TRIGGER_STATES,
  FLOW_TRIGGER_TYPES,
  PLAN_TYPE_LABEL,
  isEmailAction,
} from "@/lib/flows/catalog";

/**
 * E14-28 · QUE NO SE PUEDA CONSTRUIR UN FLUJO INVÁLIDO.
 *
 * Se valida EN EL SERVIDOR, no solo en el formulario: el editor es una ayuda,
 * no una garantía, y la acción de servidor es la única puerta por la que pasa
 * de verdad lo que se guarda. Este módulo es PURO —ni Prisma ni sesión— para
 * que el editor pueda pintar los mismos errores sin duplicar la regla.
 *
 * LA ESTRUCTURA ES FIJA: DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN. Aquí se
 * comprueba justo eso, y nada más se admite.
 */

/** Tope de piezas. No es una regla de seguridad: es lo que mantiene el editor en cuatro piezas. */
export const MAX_STEPS_PER_BRANCH = 8;
export const MAX_CONDITIONS = 8;
export const MAX_WAIT_DAYS = 365;
export const FLOW_NAME_MAX = 120;

/** El borrador que llega del editor, antes de tocar la base de datos. */
export type FlowDraftCondition = {
  type: FlowConditionType;
  config: Record<string, unknown>;
  negated?: boolean;
  /** Null = condición DE ENTRADA. Con índice de paso = puerta de ese paso. */
  stepIndex?: number | null;
};

export type FlowDraftStep = {
  branch: FlowBranch;
  position: number;
  waitDays: number;
  actionType: FlowActionType;
  actionConfig: Record<string, unknown>;
  /** Solo en `ON_NO_REPLY`: cuántos días se espera respuesta. */
  branchAfterDays?: number | null;
};

export type FlowDraft = {
  name: string;
  description?: string | null;
  centerId: string;
  triggerType: FlowTriggerType;
  triggerConfig?: Record<string, unknown> | null;
  goalKind?: FlowGoalKind | null;
  conditions: FlowDraftCondition[];
  steps: FlowDraftStep[];
};

/** Un error con el campo al que apunta, para que el editor lo pinte donde toca. */
export type FlowValidationIssue = { field: string; message: string };

export type FlowValidationResult =
  | { ok: true; draft: FlowDraft }
  | { ok: false; issues: FlowValidationIssue[] };

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v)).filter(Boolean);
}

/* ------------------------------------------------------------------------- *
 * DISPARADOR
 * ------------------------------------------------------------------------- */

function validateTrigger(draft: FlowDraft, issues: FlowValidationIssue[]): void {
  if (!FLOW_TRIGGER_TYPES.includes(draft.triggerType)) {
    issues.push({ field: "triggerType", message: "Ese disparador no existe." });
    return;
  }

  const config = draft.triggerConfig ?? {};
  const spec = FLOW_TRIGGER_NUMBER[draft.triggerType];
  if (spec) {
    const value = num(config[spec.field]);
    if (value === null || !Number.isInteger(value) || value < spec.min || value > spec.max) {
      issues.push({
        field: "triggerConfig",
        message: `«${spec.label}» tiene que ser un número entero entre ${spec.min} y ${spec.max}.`,
      });
    }
  }

  if (draft.triggerType === "MEMBER_STATE_CHANGED") {
    const state = str(config.state);
    if (!(FLOW_TRIGGER_STATES as readonly string[]).includes(state)) {
      issues.push({ field: "triggerConfig", message: "Elige a qué estado tiene que pasar el socio." });
    }
  }
}

/* ------------------------------------------------------------------------- *
 * CONDICIÓN
 * ------------------------------------------------------------------------- */

function validateCondition(cond: FlowDraftCondition, index: number, stepCount: number, issues: FlowValidationIssue[]): void {
  const field = `conditions.${index}`;
  if (!FLOW_CONDITION_TYPES.includes(cond.type)) {
    issues.push({ field, message: "Esa condición no existe." });
    return;
  }

  const config = cond.config ?? {};
  switch (cond.type) {
    case "CENTER":
      if (strList(config.centerIds).length === 0) {
        issues.push({ field, message: "La condición de centro necesita al menos un centro." });
      }
      break;
    case "PLAN_TYPE": {
      const types = strList(config.planTypes);
      if (types.length === 0) {
        issues.push({ field, message: "La condición de tipo de plan necesita al menos un tipo." });
      } else if (types.some((t) => !(t in PLAN_TYPE_LABEL))) {
        issues.push({ field, message: "Hay un tipo de plan que no existe." });
      }
      break;
    }
    case "TAG":
      // Por CLAVE, nunca por rótulo: renombrar una etiqueta en /etiquetas no
      // puede dejar la condición apuntando a nada (contrato con E1).
      if (!str(config.tagKey)) {
        issues.push({ field, message: "La condición de etiqueta necesita la clave de una etiqueta." });
      }
      break;
    case "TENURE": {
      const months = num(config.months);
      const direction = str(config.direction) || "min";
      if (months === null || !Number.isInteger(months) || months < 0 || months > 240) {
        issues.push({ field, message: "La antigüedad se mide en meses enteros, entre 0 y 240." });
      }
      if (direction !== "min" && direction !== "max") {
        issues.push({ field, message: "La antigüedad es «al menos» o «como mucho»." });
      }
      break;
    }
    case "TRAINER":
      if (strList(config.trainerUserIds).length === 0) {
        issues.push({ field, message: "La condición de entrenador necesita al menos un entrenador." });
      }
      break;
  }

  const stepIndex = cond.stepIndex;
  if (stepIndex !== null && stepIndex !== undefined) {
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= stepCount) {
      issues.push({ field, message: "Esa condición cuelga de un paso que no existe." });
    }
  }
}

/* ------------------------------------------------------------------------- *
 * ESPERA → ACCIÓN
 * ------------------------------------------------------------------------- */

function validateStep(step: FlowDraftStep, index: number, issues: FlowValidationIssue[]): void {
  const field = `steps.${index}`;

  if (!FLOW_BRANCHES.includes(step.branch)) {
    issues.push({ field, message: "Esa rama no existe." });
    return;
  }
  if (!FLOW_ACTION_TYPES.includes(step.actionType)) {
    issues.push({ field, message: "Esa acción no existe." });
    return;
  }

  if (!Number.isInteger(step.waitDays) || step.waitDays < 0 || step.waitDays > MAX_WAIT_DAYS) {
    issues.push({ field, message: `La espera son días enteros, entre 0 y ${MAX_WAIT_DAYS}.` });
  }

  const config = step.actionConfig ?? {};
  switch (step.actionType) {
    case "SEND_EMAIL":
      if (!str(config.subject)) issues.push({ field, message: "El email necesita asunto." });
      if (!str(config.bodyText)) issues.push({ field, message: "El email necesita cuerpo." });
      break;
    case "SEND_FORM":
      // El formulario es el de M5 (`member-forms.ts`): aquí solo se elige el
      // hito. Nada de montar un segundo formulario.
      if (!str(config.milestoneKey)) issues.push({ field, message: "Elige qué formulario se envía." });
      break;
    case "ADD_TAG":
    case "REMOVE_TAG":
      if (!str(config.tagKey)) issues.push({ field, message: "Elige la etiqueta." });
      break;
    case "CREATE_TASK": {
      if (!str(config.title)) issues.push({ field, message: "La tarea necesita un título." });
      const dueInDays = num(config.dueInDays ?? 0);
      if (dueInDays === null || !Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > MAX_WAIT_DAYS) {
        issues.push({ field, message: "La fecha de la tarea son días enteros desde que se crea." });
      }
      break;
    }
    case "CHANGE_STATE": {
      const state = str(config.state);
      if (!(FLOW_ACTION_STATES as readonly string[]).includes(state)) {
        issues.push({ field, message: "Elige a qué estado pasa el socio." });
      }
      break;
    }
    case "NOTIFY_DIRECTOR":
      if (!str(config.title)) issues.push({ field, message: "El aviso al director necesita un título." });
      break;
  }

  // La rama «si no responde en X días» necesita ese X, y solo ella lo tiene:
  // un `branchAfterDays` colgando de otra rama es una configuración que el
  // motor no sabría ejecutar y que nadie sabría leer en pantalla.
  if (step.branch === "ON_NO_REPLY") {
    const days = num(step.branchAfterDays);
    if (step.position === 0 && (days === null || !Number.isInteger(days) || days < 1 || days > 90)) {
      issues.push({ field, message: "«Si no responde» necesita en cuántos días se da por no recibida (1 a 90)." });
    }
  } else if (step.branchAfterDays !== null && step.branchAfterDays !== undefined) {
    issues.push({ field, message: `«En X días» solo existe en la rama «${FLOW_BRANCH_LABEL.ON_NO_REPLY}».` });
  }
}

/* ------------------------------------------------------------------------- *
 * El flujo entero
 * ------------------------------------------------------------------------- */

export function validateFlow(draft: FlowDraft): FlowValidationResult {
  const issues: FlowValidationIssue[] = [];

  const name = str(draft.name);
  if (name.length < 2) issues.push({ field: "name", message: "El flujo necesita un nombre." });
  if (name.length > FLOW_NAME_MAX) issues.push({ field: "name", message: `El nombre no puede pasar de ${FLOW_NAME_MAX} caracteres.` });

  // Un flujo es DE UN CENTRO: los horarios, el remitente y la sala de la que
  // habla el correo son los suyos.
  if (!str(draft.centerId)) issues.push({ field: "centerId", message: "El flujo tiene que ser de un centro." });

  if (draft.goalKind && !(draft.goalKind in FLOW_GOAL_LABEL)) {
    issues.push({ field: "goalKind", message: "Ese objetivo no existe." });
  }

  validateTrigger(draft, issues);

  const steps = draft.steps ?? [];
  if (steps.length === 0) {
    issues.push({ field: "steps", message: "Un flujo sin ninguna acción no hace nada: añade al menos un paso." });
  }
  steps.forEach((step, i) => validateStep(step, i, issues));

  // Las posiciones de cada rama: correlativas desde 0 y sin repetir. La base de
  // datos ya tiene `@@unique([flowId, branch, position])`, pero un choque ahí
  // sale como error de escritura y no como «esto está mal montado».
  for (const branch of FLOW_BRANCHES) {
    const positions = steps.filter((s) => s.branch === branch).map((s) => s.position).sort((a, b) => a - b);
    if (positions.length === 0) continue;
    if (positions.length > MAX_STEPS_PER_BRANCH) {
      issues.push({
        field: "steps",
        message: `La rama «${FLOW_BRANCH_LABEL[branch]}» no puede pasar de ${MAX_STEPS_PER_BRANCH} pasos.`,
      });
    }
    const correlativas = positions.every((p, i) => p === i);
    if (!correlativas) {
      issues.push({ field: "steps", message: `Los pasos de «${FLOW_BRANCH_LABEL[branch]}» están desordenados o repetidos.` });
    }
  }

  // Un flujo tiene TRONCO. Sin él, las ramas cuelgan de un email que nunca sale.
  const mainSteps = steps.filter((s) => s.branch === "MAIN");
  if (steps.length > 0 && mainSteps.length === 0) {
    issues.push({ field: "steps", message: "El flujo necesita al menos un paso en el tronco." });
  }

  // LAS RAMAS SON REACCIONES A UN CORREO. «Si hace clic», «si responde» y «si
  // no responde» no significan nada si antes no se ha mandado nada: sin esta
  // comprobación se puede guardar un flujo con una rama que no se ejecutará
  // jamás, y eso no se ve en pantalla — parece que funciona y no funciona.
  const troncoManda = mainSteps.some((s) => isEmailAction(s.actionType));
  for (const branch of FLOW_CONDITIONAL_BRANCHES) {
    const tiene = steps.some((s) => s.branch === branch);
    if (tiene && !troncoManda) {
      issues.push({
        field: "steps",
        message: `«${FLOW_BRANCH_LABEL[branch]}» necesita que el tronco mande antes un email: si no, esa rama no se ejecuta nunca.`,
      });
    }
  }

  const conditions = draft.conditions ?? [];
  if (conditions.length > MAX_CONDITIONS) {
    issues.push({ field: "conditions", message: `No más de ${MAX_CONDITIONS} condiciones: un flujo con más es dos flujos.` });
  }
  conditions.forEach((cond, i) => validateCondition(cond, i, steps.length, issues));

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, draft: { ...draft, name, description: draft.description?.trim() || null } };
}

/** El primer error, para el `toast` del editor. */
export function firstIssue(result: FlowValidationResult): string | null {
  return result.ok ? null : (result.issues[0]?.message ?? "El flujo no es válido.");
}

/** Tipos de plan válidos, tipados, para el desplegable del editor. */
export const PLAN_TYPE_VALUES = Object.keys(PLAN_TYPE_LABEL) as PlanType[];

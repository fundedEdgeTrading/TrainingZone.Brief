import type { FlowConditionType, MemberState, PlanType } from "@prisma/client";

/**
 * E2 · Las CONDICIONES, evaluadas sobre un fotograma del socio.
 *
 * Mismo patrón que `tag-engine.ts`: el socio sale de la base de datos UNA vez
 * y las condiciones deciden sobre ese fotograma sin volver a consultar. Es lo
 * que las hace probables sin base de datos y lo que evita que una cola de
 * quinientas inscripciones dispare cinco mil consultas.
 *
 * TODAS LAS CONDICIONES DEL MISMO ÁMBITO SE CUMPLEN A LA VEZ (Y lógico). Un O
 * lógico son dos flujos, y eso es lo que mantiene el editor en cuatro piezas.
 */

export type FlowMemberFacts = {
  memberId: string;
  /** `Member.primaryCenterId`. El ámbito de centro se aplica ANTES, al leer. */
  centerId: string;
  state: MemberState;
  joinedAt: Date;
  /** Tipos de plan de sus suscripciones vivas. */
  planTypes: PlanType[];
  /** CLAVES de sus etiquetas de hoy (`tagsForMember`), nunca rótulos. */
  tagKeys: string[];
  /** Entrenadores con los que de hecho entrena (sesiones asignadas). */
  trainerUserIds: string[];
};

export type FlowConditionShape = {
  type: FlowConditionType;
  config: Record<string, unknown>;
  negated: boolean;
};

const MONTH_MS = 30 * 86_400_000;

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/** Meses cumplidos desde el alta. Aproximación de 30 días: la antigüedad se
 * segmenta por tramos («más de 6 meses»), no por el día exacto. */
export function tenureMonths(joinedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - joinedAt.getTime()) / MONTH_MS);
}

/** Una condición, sin el `negated` aplicado. */
function matchesRaw(cond: FlowConditionShape, facts: FlowMemberFacts, now: Date): boolean {
  const config = cond.config ?? {};
  switch (cond.type) {
    case "CENTER":
      return strList(config.centerIds).includes(facts.centerId);
    case "PLAN_TYPE": {
      const wanted = strList(config.planTypes);
      return facts.planTypes.some((t) => wanted.includes(t));
    }
    case "TAG":
      return facts.tagKeys.includes(String(config.tagKey ?? ""));
    case "TENURE": {
      const months = Number(config.months);
      if (!Number.isFinite(months)) return false;
      const tenure = tenureMonths(facts.joinedAt, now);
      return String(config.direction ?? "min") === "max" ? tenure <= months : tenure >= months;
    }
    case "TRAINER": {
      const wanted = strList(config.trainerUserIds);
      return facts.trainerUserIds.some((t) => wanted.includes(t));
    }
    default:
      // Enum cerrado: llegar aquí solo puede significar una fila escrita por una
      // versión posterior. No se adivina — no se cumple.
      return false;
  }
}

export function matchesCondition(cond: FlowConditionShape, facts: FlowMemberFacts, now: Date): boolean {
  const raw = matchesRaw(cond, facts, now);
  return cond.negated ? !raw : raw;
}

/**
 * Y lógico entre todas. Sin condiciones se cumple: un flujo sin condiciones
 * alcanza a todo el que dispare, que es lo que dice el editor cuando la lista
 * está vacía.
 */
export function matchesAllConditions(
  conditions: FlowConditionShape[],
  facts: FlowMemberFacts,
  now: Date
): boolean {
  return conditions.every((c) => matchesCondition(c, facts, now));
}

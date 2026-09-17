import type {
  FlowActionType,
  FlowBranch,
  FlowConditionType,
  FlowGoalKind,
  FlowTriggerType,
} from "@prisma/client";

import type { FlowDraft } from "@/lib/flows/validate";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E3 · EL VOCABULARIO DE LAS SEMILLAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Una SEMILLA es la definición de uno de los flujos de salida en las cuatro
 * piezas de siempre —DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN— escrita en
 * código para que se pueda sembrar, leer y probar sin base de datos.
 *
 * ESTE TIPO HABLA EL IDIOMA DEL MOTOR, no uno propio. Es el aviso que dejó E2
 * en `flows/index.ts`: la semilla de referidos que escribió R1 ANTES de que el
 * motor existiera medía las esperas en HORAS y configuraba `TENURE` con
 * `minMonths`, y ninguna de las dos cosas existe en `FlowStep` /
 * `FlowCondition`. Aquí se habla como el motor —`waitDays` en días y
 * `{ months, direction }`— y `toFlowDraft` devuelve exactamente el `FlowDraft`
 * que valida `validateFlow`. Una semilla que no pase ese validador no se puede
 * sembrar, y eso lo comprueba `seeds.test.ts` sin tocar Postgres.
 *
 * ---------------------------------------------------------------------------
 * LOS HUECOS SE DECLARAN COMO DATO, NO COMO COMENTARIO
 * ---------------------------------------------------------------------------
 * El patrón lo estrenó R1 con `pendingConditions` y aquí se generaliza, porque
 * los huecos han resultado ser más de uno y de más de una clase: hay
 * condiciones que el catálogo no sabe expresar, disparadores que no existen y
 * datos por socio que el correo no puede llevar.
 *
 * Declararlos como dato hace tres cosas que un comentario no hace:
 *
 *  1. Se VEN EN LA PANTALLA. El panel por flujo los pinta debajo del embudo, así
 *     que dirección sabe qué parte de ese flujo todavía la hace una persona
 *     antes de encenderlo, en vez de descubrirlo con el correo ya enviado.
 *  2. Se PRUEBAN. `seeds.test.ts` exige que cada hueco diga a quién hay que
 *     pedírselo y qué se hace mientras tanto: un «TODO» suelto no pasa el test.
 *  3. Se BORRAN DE UNA VEZ. El día que la condición exista, la entrada
 *     desaparece de un borrado y el flujo se queda entero.
 *
 * NINGÚN HUECO SE TAPA INVENTANDO. Si un texto necesita un dato que el centro
 * no ha rellenado, el texto no lo dice: manda a donde el dato está de verdad.
 */

/* ------------------------------------------------------------------------- *
 * Las piezas
 * ------------------------------------------------------------------------- */

export type FlowSeedCondition = {
  type: FlowConditionType;
  /** Los parámetros, con las MISMAS claves que lee `conditions.ts`. */
  config: Record<string, unknown>;
  /** «NO tiene la etiqueta X». Es lo que evita un flujo por cada etiqueta que no se tiene. */
  negated?: boolean;
  /** `null` = condición DE ENTRADA. Con índice = puerta de ese paso concreto. */
  stepIndex?: number | null;
};

export type FlowSeedStep = {
  branch: FlowBranch;
  position: number;
  /** ESPERA EN DÍAS desde que se ejecutó el paso anterior. `0` = en la misma pasada. */
  waitDays: number;
  actionType: FlowActionType;
  actionConfig: Record<string, unknown>;
  /** Solo en `ON_NO_REPLY`: en cuántos días se da por no recibida. */
  branchAfterDays?: number | null;
};

/* ------------------------------------------------------------------------- *
 * Los huecos
 * ------------------------------------------------------------------------- */

/** De qué clase es lo que falta. Sirve para agrupar la lista en pantalla. */
export type FlowSeedGapKind =
  /** El catálogo `FlowConditionType` no sabe expresar esta condición. */
  | "condicion"
  /** No hay disparador que dé esta señal. */
  | "disparador"
  /** El correo o la tarea necesitan un dato DEL SOCIO y el motor no interpola. */
  | "dato-por-socio"
  /** El dato existe en el modelo pero el centro puede no haberlo rellenado. */
  | "dato-del-centro";

/**
 * Algo que este flujo necesita y el motor todavía no sabe hacer.
 *
 * NO SE ARREGLA DESDE AQUÍ. `src/lib/flows/` es de E2 y sus reglas de seguridad
 * están probadas una por una: cambiarlas por nuestra cuenta para que encaje un
 * flujo es exactamente lo que el encargo prohíbe. Se declara, se pinta y se pide.
 */
export type FlowSeedGap = {
  kind: FlowSeedGapKind;
  /** Qué falta, en una frase y en castellano. */
  falta: string;
  /** A qué paso o a qué parte del flujo afecta. */
  afecta: string;
  /** Qué fichero habría que tocar y de qué pista es. Aquí NO se toca. */
  duenio: string;
  /** Qué hace el flujo MIENTRAS TANTO, para que nadie lo dé por resuelto. */
  mientrasTanto: string;
  /** Las salidas posibles, para que la decisión no se tome dos veces. */
  salidas: string[];
};

/* ------------------------------------------------------------------------- *
 * La semilla
 * ------------------------------------------------------------------------- */

export type FlowSeed = {
  /**
   * Clave estable de la semilla. Va a `Flow.seedKey` con el centro pegado
   * detrás (ver `flowSeedKey`), porque el esquema tiene
   * `@@unique([orgId, seedKey])` y un flujo es DE UN CENTRO: sin el sufijo, un
   * mismo flujo no se podría sembrar en los tres centros de la organización.
   */
  seedKey: string;
  /** El orden de prioridad del encargo (1 a 7). Es el orden del corte de alcance. */
  order: number;
  name: string;
  description: string;
  trigger: { type: FlowTriggerType; config: Record<string, unknown> };
  conditions: FlowSeedCondition[];
  steps: FlowSeedStep[];
  /**
   * EL OBJETIVO DEL EMBUDO (E14-36). No es decorativo: es la tercera cifra del
   * panel, y se mide contra datos que YA existen — la resuelve
   * `seeds/goals.ts`, una función por tipo de objetivo.
   */
  goalKind: FlowGoalKind;
  /** Por qué ESE objetivo en ESTE flujo. Se lee en la propia pantalla del panel. */
  goalRationale: string;
  /** Lo que falta para que este flujo esté entero. Vacío = está entero. */
  gaps: FlowSeedGap[];
};

/* ------------------------------------------------------------------------- *
 * De semilla a borrador del motor
 * ------------------------------------------------------------------------- */

/**
 * La clave que de verdad se guarda en `Flow.seedKey`.
 *
 * `@@unique([orgId, seedKey])` es por ORGANIZACIÓN y un flujo es DE UN CENTRO,
 * así que la clave lleva el centro dentro. Sin esto, sembrar el mismo flujo en
 * el segundo centro chocaría con el del primero y parecería un fallo de datos.
 */
export function flowSeedKey(seedKey: string, centerId: string): string {
  return `${seedKey}:${centerId}`;
}

/** La semilla en la forma exacta que valida y guarda el motor. */
export function toFlowDraft(seed: FlowSeed, centerId: string): FlowDraft {
  return {
    name: seed.name,
    description: seed.description,
    centerId,
    triggerType: seed.trigger.type,
    triggerConfig: seed.trigger.config,
    goalKind: seed.goalKind,
    conditions: seed.conditions.map((c) => ({
      type: c.type,
      config: c.config,
      negated: c.negated ?? false,
      stepIndex: c.stepIndex ?? null,
    })),
    steps: seed.steps.map((s) => ({
      branch: s.branch,
      position: s.position,
      waitDays: s.waitDays,
      actionType: s.actionType,
      actionConfig: s.actionConfig,
      branchAfterDays: s.branchAfterDays ?? null,
    })),
  };
}

import type { FlowActionType, FlowBranch, FlowConditionType, FlowGoalKind, FlowTriggerType } from "@prisma/client";

import type { FlowDraft } from "@/lib/flows/validate";

/**
 * La forma del borrador que edita el formulario, SIN `"use client"`.
 *
 * Vive aparte de `flow-editor.tsx` porque las páginas de servidor necesitan
 * `emptyFlowValue` para pintar el editor vacío, y una función exportada desde
 * un módulo de cliente no se puede llamar desde el servidor — Next lo corta en
 * ejecución, no al compilar.
 */

export type FlowEditorOptions = {
  centers: { id: string; name: string }[];
  tags: { key: string; label: string; kind: "AUTOMATIC" | "MANUAL" }[];
  trainers: { id: string; name: string }[];
  milestones: { key: string; label: string }[];
};

export type FlowConditionRow = { type: FlowConditionType; config: Record<string, unknown>; negated: boolean };

export type FlowStepRow = {
  branch: FlowBranch;
  waitDays: number;
  actionType: FlowActionType;
  actionConfig: Record<string, unknown>;
  branchAfterDays: number | null;
};

export type FlowEditorValue = {
  name: string;
  description: string;
  centerId: string;
  triggerType: FlowTriggerType;
  triggerConfig: Record<string, unknown>;
  goalKind: FlowGoalKind | "";
  conditions: FlowConditionRow[];
  steps: FlowStepRow[];
};

/** Un flujo en blanco: alta nueva y un email, que es el caso de partida real. */
export function emptyFlowValue(centerId: string): FlowEditorValue {
  return {
    name: "",
    description: "",
    centerId,
    triggerType: "MEMBER_JOINED",
    triggerConfig: {},
    goalKind: "",
    conditions: [],
    steps: [{ branch: "MAIN", waitDays: 0, actionType: "SEND_EMAIL", actionConfig: {}, branchAfterDays: null }],
  };
}

/**
 * Del estado del formulario al borrador que entiende el validador.
 *
 * Las posiciones se derivan del ORDEN dentro de cada rama y no se piden: un
 * número de posición escrito a mano es un hueco o un duplicado esperando a
 * pasar, y la unicidad `(flowId, branch, position)` lo cazaría como error de
 * escritura y no como «esto está mal montado».
 */
export function toFlowDraft(value: FlowEditorValue): FlowDraft {
  const byBranch = new Map<FlowBranch, number>();
  const steps = value.steps.map((s) => {
    const position = byBranch.get(s.branch) ?? 0;
    byBranch.set(s.branch, position + 1);
    return {
      branch: s.branch,
      position,
      waitDays: Number(s.waitDays),
      actionType: s.actionType,
      actionConfig: s.actionConfig,
      branchAfterDays: s.branch === "ON_NO_REPLY" && position === 0 ? Number(s.branchAfterDays ?? 3) : null,
    };
  });

  return {
    name: value.name,
    description: value.description,
    centerId: value.centerId,
    triggerType: value.triggerType,
    triggerConfig: value.triggerConfig,
    goalKind: value.goalKind || null,
    conditions: value.conditions.map((c) => ({ type: c.type, config: c.config, negated: c.negated, stepIndex: null })),
    steps,
  };
}

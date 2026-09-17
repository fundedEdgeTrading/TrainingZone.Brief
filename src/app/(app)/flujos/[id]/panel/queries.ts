import type { FlowBranch, FlowGoalKind, FlowStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ScopedUser } from "@/lib/center-scope";
import { FLOW_TEMPLATE_CUSTOM, FLOW_TEMPLATE_LABEL } from "@/lib/emails/flow-templates";
import {
  FLOW_ACTION_LABEL,
  FLOW_BRANCH_LABEL,
  FLOW_GOAL_DEFINITION,
  FLOW_GOAL_LABEL,
  FLOW_STATUS_LABEL,
  FLOW_TRIGGER_LABEL,
  FLOW_TRIGGER_SIGNAL,
  isEmailAction,
} from "@/lib/flows/catalog";
import { flowFunnel, flowGoalResolverFor, type FlowFunnel } from "@/lib/flows/panel";
import { getFlow } from "@/lib/flows/queries";
// Importar las semillas REGISTRA los resolutores del objetivo. Sin esta línea
// el panel pintaría «falta definir cómo se mide» en los ocho flujos.
import { flowSeedBySeedKey, type FlowSeedGap } from "@/lib/flows/seeds";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E14-36 · EL PANEL POR FLUJO · de dónde sale cada cifra
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tres cifras y solo tres: CUÁNTOS ENTRAN, CUÁNTOS HACEN CLIC y CUÁNTOS CUMPLEN
 * EL OBJETIVO. La cuarta que siempre se pide —la tasa de apertura— NO ESTÁ, y no
 * por olvido: medirla exige un píxel de traza, y con él un CMP con «rechazar
 * todo» al mismo nivel visual que «aceptar todo» en el mismo cambio (AGENTS.md,
 * decisión D-L3-4 del plan). Si alguien pregunta por la apertura, la respuesta
 * es el clic: el enlace es nuestro y no necesita permiso de nadie.
 *
 * ---------------------------------------------------------------------------
 * EL OBJETIVO SE MIDE EN VIVO Y NO SE ESCRIBE AL ABRIR LA PANTALLA
 * ---------------------------------------------------------------------------
 * `FlowEnrollment.goalMetAt` es la fotografía guardada, y la escribe
 * `refreshFlowGoals` cuando alguien pulsa «Actualizar la medición». Pero el
 * panel NO depende de esa fotografía para pintar: recalcula el objetivo cada vez
 * que se abre, con los mismos resolutores, y enseña ese número.
 *
 * Es a propósito y por dos razones. La primera, que abrir una pantalla no debe
 * escribir en la base de datos: un render que muta es un render que no se puede
 * reintentar. La segunda, y la que de verdad importa: hoy NADIE llama a
 * `refreshFlowGoals` —el cron de flujos solo consume la cola—, así que un panel
 * que leyera `goalMetAt` enseñaría cero para siempre y parecería que ningún
 * correo sirve para nada. Se dice aquí y va en el informe de la pista.
 *
 * ÁMBITO DE CENTRO: lo aplica `getFlow` (E2), que devuelve `null` fuera de
 * ámbito. Aquí NO se monta una segunda comprobación «espejo»: ese duplicado es
 * el fallo que más se repite en este repositorio.
 */

export type FlowPanelStep = {
  id: string;
  branch: FlowBranch;
  branchLabel: string;
  position: number;
  waitDays: number;
  actionLabel: string;
  /** Solo los pasos que escriben al socio tienen envíos que contar. */
  mandaCorreo: boolean;
  subject: string | null;
  templateLabel: string;
  sent: number;
  clicked: number;
};

export type FlowPanelData = {
  flow: {
    id: string;
    name: string;
    description: string | null;
    status: FlowStatus;
    statusLabel: string;
    centerName: string;
    triggerLabel: string;
    triggerSignal: string;
  };
  funnel: FlowFunnel;
  /** El objetivo recalculado AHORA. `null` = el flujo no declara objetivo. */
  goalMetLive: number | null;
  goalKind: FlowGoalKind | null;
  goalLabel: string | null;
  goalDefinition: string | null;
  /** Por qué ESE objetivo en ESTE flujo. Sale de la semilla; `null` si se montó a mano. */
  goalRationale: string | null;
  /** Cuándo se guardó la última medición. `null` = nunca se ha pulsado «Actualizar». */
  goalSavedAt: Date | null;
  /** Inscripciones que todavía no han recibido ningún correo: no se les puede medir nada. */
  sinCorreoTodavia: number;
  queued: number;
  completed: number;
  cancelled: number;
  steps: FlowPanelStep[];
  /** Lo que a este flujo le falta para estar entero. Vacío = está entero. */
  gaps: FlowSeedGap[];
};

export async function flowPanelData(user: ScopedUser, flowId: string): Promise<FlowPanelData | null> {
  const flow = await getFlow(user, flowId);
  if (!flow) return null;

  const orgId = user.orgId;

  const [funnel, semilla, porEstado, envios, clics, guardadas, medicion] = await Promise.all([
    flowFunnel(orgId, flowId),
    // `getFlow` no trae `seedKey` —su `select` es de E2 y no se toca—, así que
    // se pide aparte. El ámbito ya lo ha comprobado `getFlow` justo arriba.
    prisma.flow.findFirst({ where: { id: flowId, orgId }, select: { seedKey: true } }),
    prisma.flowEnrollment.groupBy({ by: ["status"], where: { orgId, flowId }, _count: { _all: true } }),
    prisma.flowEmailLog.groupBy({
      by: ["stepId"],
      where: { orgId, flowId, testMode: false },
      _count: { _all: true },
    }),
    prisma.flowEmailLog.groupBy({
      by: ["stepId"],
      where: { orgId, flowId, testMode: false, clickedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.flowEnrollment.aggregate({ where: { orgId, flowId }, _max: { goalMetAt: true } }),
    medirObjetivo(orgId, flowId, flow.goalKind),
  ]);

  const cuentaPorEstado = new Map(porEstado.map((row) => [row.status, row._count._all]));
  const enviosPorPaso = new Map(envios.map((row) => [row.stepId, row._count._all]));
  const clicsPorPaso = new Map(clics.map((row) => [row.stepId, row._count._all]));

  const seed = semilla?.seedKey ? flowSeedBySeedKey(semilla.seedKey) : null;

  return {
    flow: {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      statusLabel: FLOW_STATUS_LABEL[flow.status],
      centerName: flow.center.name,
      triggerLabel: FLOW_TRIGGER_LABEL[flow.triggerType],
      triggerSignal: FLOW_TRIGGER_SIGNAL[flow.triggerType],
    },
    funnel,
    goalMetLive: flow.goalKind ? medicion.cumplidos : null,
    goalKind: flow.goalKind,
    goalLabel: flow.goalKind ? FLOW_GOAL_LABEL[flow.goalKind] : null,
    goalDefinition: flow.goalKind ? FLOW_GOAL_DEFINITION[flow.goalKind] : null,
    goalRationale: seed?.goalRationale ?? null,
    goalSavedAt: guardadas._max.goalMetAt,
    sinCorreoTodavia: medicion.sinCorreo,
    queued: cuentaPorEstado.get("SCHEDULED") ?? 0,
    completed: cuentaPorEstado.get("COMPLETED") ?? 0,
    cancelled: cuentaPorEstado.get("CANCELLED") ?? 0,
    steps: flow.steps.map((step) => {
      const config = (step.actionConfig ?? {}) as Record<string, unknown>;
      const manda = isEmailAction(step.actionType);
      const templateKey = typeof config.templateKey === "string" ? config.templateKey : FLOW_TEMPLATE_CUSTOM;
      return {
        id: step.id,
        branch: step.branch,
        branchLabel: FLOW_BRANCH_LABEL[step.branch],
        position: step.position,
        waitDays: step.waitDays,
        actionLabel: FLOW_ACTION_LABEL[step.actionType],
        mandaCorreo: manda,
        subject: manda && typeof config.subject === "string" ? config.subject : null,
        templateLabel: FLOW_TEMPLATE_LABEL[templateKey] ?? templateKey,
        sent: enviosPorPaso.get(step.id) ?? 0,
        clicked: clicsPorPaso.get(step.id) ?? 0,
      };
    }),
    gaps: seed?.gaps ?? [],
  };
}

/**
 * Cuántos cumplen el objetivo AHORA MISMO, sin escribir nada.
 *
 * Se mide sobre TODAS las inscripciones que recibieron al menos un correo de
 * verdad —no solo las que aún tienen `goalMetAt` a null, como hace
 * `refreshFlowGoals`—, porque aquí no se está actualizando una fotografía: se
 * está contestando «de los que recibieron el correo, ¿cuántos hicieron lo que
 * queríamos?». Quien no ha recibido nada todavía no puede contar ni a favor ni
 * en contra, y por eso se devuelve aparte: el denominador honesto del embudo
 * son los que recibieron algo, no los que entraron.
 */
async function medirObjetivo(
  orgId: string,
  flowId: string,
  goalKind: FlowGoalKind | null
): Promise<{ cumplidos: number; sinCorreo: number }> {
  if (!goalKind) return { cumplidos: 0, sinCorreo: 0 };

  const inscripciones = await prisma.flowEnrollment.findMany({
    where: { orgId, flowId },
    select: {
      id: true,
      memberId: true,
      emails: { where: { testMode: false }, orderBy: { sentAt: "asc" }, take: 1, select: { sentAt: true } },
    },
  });

  const candidates = inscripciones
    .filter((e) => e.emails.length > 0)
    .map((e) => ({ enrollmentId: e.id, memberId: e.memberId, firstEmailAt: e.emails[0].sentAt }));
  const sinCorreo = inscripciones.length - candidates.length;

  const resolver = flowGoalResolverFor(goalKind);
  if (!resolver || candidates.length === 0) return { cumplidos: 0, sinCorreo };

  const hits = await resolver(orgId, candidates, new Date());
  return { cumplidos: hits.length, sinCorreo };
}

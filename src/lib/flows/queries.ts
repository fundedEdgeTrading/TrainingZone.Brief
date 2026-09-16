import type { FlowStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { centerScopeFor, isCenterInScope, type ScopedUser } from "@/lib/center-scope";
import { canManageMembers } from "@/lib/rbac";
import { FLOW_STATUS_LABEL } from "@/lib/flows/catalog";
import { flowFunnel, type FlowFunnel } from "@/lib/flows/panel";
import { validateFlow, type FlowDraft, type FlowValidationIssue } from "@/lib/flows/validate";

/**
 * E2 · Lectura y escritura del módulo de flujos, CON EL ÁMBITO DE CENTRO
 * DENTRO.
 *
 * Igual que hizo E1 con `tags-queries.ts`: la comprobación de ámbito vive aquí
 * y no en quien llama. Una copia «espejo» de esta comprobación en la acción de
 * servidor —o mañana en la API móvil— es exactamente el fallo que más se repite
 * en este repositorio, y aquí hay dinero y correo a socios de por medio.
 *
 * Un flujo es DE UN CENTRO. Una dirección de centro ve, monta y pausa los
 * flujos de SUS centros; la dirección de organización, los de todos.
 */

const NO_PERMISSION = "No tienes permiso para gestionar los flujos.";
const OUT_OF_SCOPE = "Ese flujo no es de tus centros.";
const NOT_FOUND = "Ese flujo no existe.";

export type FlowActionResult = { ok: true; id?: string } | { ok: false; error: string; issues?: FlowValidationIssue[] };

/* ------------------------------------------------------------------------- *
 * El estado del módulo: pausa global y buzón de pruebas
 * ------------------------------------------------------------------------- */

export type FlowsModuleState = {
  pausedAt: Date | null;
  testEmail: string | null;
  /** Cuántas inscripciones están esperando ahora mismo. Lo que la pausa NO pierde. */
  queued: number;
};

export async function getFlowsModuleState(user: ScopedUser): Promise<FlowsModuleState> {
  const [org, queued] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { flowsPausedAt: true, flowsTestEmail: true },
    }),
    prisma.flowEnrollment.count({ where: { orgId: user.orgId, status: "SCHEDULED" } }),
  ]);
  return { pausedAt: org?.flowsPausedAt ?? null, testEmail: org?.flowsTestEmail ?? null, queued };
}

/**
 * REGLA 4 · La pausa global. Para todos los flujos de la organización al
 * instante, y lo encolado NO se pierde: `FlowEnrollment.nextRunAt` se queda
 * donde estaba y el cron simplemente no lo consume mientras esto no sea null.
 *
 * Es de dirección de ORGANIZACIÓN y no de centro: es el botón de «para todo», y
 * un botón de «para todo» que solo para una parte no sirve para dormir tranquilo.
 */
export async function setFlowsPaused(user: ScopedUser, paused: boolean): Promise<FlowActionResult> {
  if (user.role !== "OWNER") return { ok: false, error: "La pausa global es de dirección de la organización." };
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { flowsPausedAt: paused ? new Date() : null },
  });
  return { ok: true };
}

/** REGLA 5 · El buzón de pruebas al que van TODOS los envíos de un flujo en borrador. */
export async function setFlowsTestEmail(user: ScopedUser, email: string): Promise<FlowActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: NO_PERMISSION };
  const clean = email.trim();
  // Sin dirección no se puede probar nada, así que vaciarla se admite: lo que
  // pasa entonces es que un flujo en borrador no manda, y la pantalla lo dice.
  if (clean && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, error: "Eso no parece una dirección de correo." };
  }
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { flowsTestEmail: clean || null },
  });
  return { ok: true };
}

/* ------------------------------------------------------------------------- *
 * El listado
 * ------------------------------------------------------------------------- */

export type FlowListItem = {
  id: string;
  name: string;
  description: string | null;
  status: FlowStatus;
  statusLabel: string;
  centerId: string;
  centerName: string;
  triggerType: string;
  /** Inscripciones vivas: lo que este flujo tiene encolado ahora mismo. */
  queued: number;
  /** Cuántos han entrado en total. */
  entered: number;
  /** Correos que llegaron de verdad al socio. */
  sent: number;
  steps: number;
  updatedAt: Date;
};

export async function listFlows(user: ScopedUser): Promise<FlowListItem[]> {
  const scope = await centerScopeFor(user);
  // Ámbito vacío = no manda en ningún centro: no ve nada. Sin esta rama,
  // `{ in: [] }` y «sin filtro» se confunden y saldría la organización entera.
  if (scope !== null && scope.length === 0) return [];

  const flows = await prisma.flow.findMany({
    where: { orgId: user.orgId, ...(scope === null ? {} : { centerId: { in: scope } }) },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      centerId: true,
      triggerType: true,
      updatedAt: true,
      center: { select: { name: true } },
      _count: { select: { steps: true, enrollments: true } },
    },
  });
  if (flows.length === 0) return [];

  const ids = flows.map((f) => f.id);
  const [queued, sent] = await Promise.all([
    prisma.flowEnrollment.groupBy({
      by: ["flowId"],
      where: { orgId: user.orgId, flowId: { in: ids }, status: "SCHEDULED" },
      _count: { _all: true },
    }),
    prisma.flowEmailLog.groupBy({
      by: ["flowId"],
      where: { orgId: user.orgId, flowId: { in: ids }, testMode: false },
      _count: { _all: true },
    }),
  ]);
  const queuedBy = new Map(queued.map((q) => [q.flowId, q._count._all]));
  const sentBy = new Map(sent.map((s) => [s.flowId, s._count._all]));

  return flows.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    status: f.status,
    statusLabel: FLOW_STATUS_LABEL[f.status],
    centerId: f.centerId,
    centerName: f.center.name,
    triggerType: f.triggerType,
    queued: queuedBy.get(f.id) ?? 0,
    entered: f._count.enrollments,
    sent: sentBy.get(f.id) ?? 0,
    steps: f._count.steps,
    updatedAt: f.updatedAt,
  }));
}

const FLOW_DETAIL_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  centerId: true,
  triggerType: true,
  triggerConfig: true,
  goalKind: true,
  updatedAt: true,
  center: { select: { name: true } },
  conditions: {
    select: { id: true, type: true, config: true, negated: true, stepId: true, position: true },
    orderBy: { position: "asc" },
  },
  steps: {
    select: {
      id: true,
      branch: true,
      position: true,
      waitDays: true,
      actionType: true,
      actionConfig: true,
      branchAfterDays: true,
    },
    orderBy: [{ branch: "asc" }, { position: "asc" }],
  },
} satisfies Prisma.FlowSelect;

export type FlowDetail = Prisma.FlowGetPayload<{ select: typeof FLOW_DETAIL_SELECT }>;

export async function getFlow(user: ScopedUser, flowId: string): Promise<FlowDetail | null> {
  const flow = await prisma.flow.findFirst({ where: { id: flowId, orgId: user.orgId }, select: FLOW_DETAIL_SELECT });
  // Fuera de ámbito devuelve `null`, no un error: un error que distingue «no
  // existe» de «no es tuyo» cuenta lo que hay en el centro de al lado.
  if (!flow) return null;
  if (!(await isCenterInScope(user, flow.centerId))) return null;
  return flow;
}

export async function getFlowFunnel(user: ScopedUser, flowId: string): Promise<FlowFunnel | null> {
  const flow = await getFlow(user, flowId);
  if (!flow) return null;
  return flowFunnel(user.orgId, flowId);
}

/* ------------------------------------------------------------------------- *
 * Guardar · LA VALIDACIÓN VA EN EL SERVIDOR
 * ------------------------------------------------------------------------- */

/**
 * Crear o reemplazar un flujo. `validateFlow` se ejecuta AQUÍ, en el servidor:
 * el formulario ayuda, pero la acción de servidor es la única puerta por la que
 * pasa de verdad lo que se guarda, y un `fetch` a mano se la salta entera.
 *
 * Los pasos y las condiciones se reemplazan en bloque dentro de una
 * transacción. Editar en sitio sería más fino, pero dejaría estados a medias
 * —un paso borrado y su condición viva— sobre una cola que está corriendo.
 */
export async function saveFlow(
  user: ScopedUser,
  draft: FlowDraft,
  flowId?: string
): Promise<FlowActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: NO_PERMISSION };

  const validation = validateFlow(draft);
  if (!validation.ok) {
    return { ok: false, error: validation.issues[0]?.message ?? "El flujo no es válido.", issues: validation.issues };
  }
  const clean = validation.draft;

  if (!(await isCenterInScope(user, clean.centerId))) return { ok: false, error: OUT_OF_SCOPE };

  if (flowId) {
    const existing = await getFlow(user, flowId);
    if (!existing) return { ok: false, error: NOT_FOUND };
  }

  const id = await prisma.$transaction(async (tx) => {
    const flow = flowId
      ? await tx.flow.update({
          where: { id: flowId },
          data: {
            name: clean.name,
            description: clean.description ?? null,
            centerId: clean.centerId,
            triggerType: clean.triggerType,
            triggerConfig: (clean.triggerConfig ?? {}) as Prisma.InputJsonValue,
            goalKind: clean.goalKind ?? null,
          },
          select: { id: true },
        })
      : await tx.flow.create({
          data: {
            orgId: user.orgId,
            centerId: clean.centerId,
            name: clean.name,
            description: clean.description ?? null,
            // Un flujo NACE EN BORRADOR, siempre. Nadie enciende sin querer un
            // flujo que escribe a 49 socios: activarlo es un gesto aparte.
            status: "DRAFT",
            triggerType: clean.triggerType,
            triggerConfig: (clean.triggerConfig ?? {}) as Prisma.InputJsonValue,
            goalKind: clean.goalKind ?? null,
            createdByUserId: user.id,
          },
          select: { id: true },
        });

    if (flowId) {
      // `FlowEmailLog.stepId` es `SetNull`, así que el histórico de envíos
      // sobrevive al reemplazo de los pasos: se pierde de qué paso salió cada
      // correo, no el correo.
      await tx.flowCondition.deleteMany({ where: { flowId: flow.id } });
      await tx.flowStep.deleteMany({ where: { flowId: flow.id } });
    }

    const stepIds: string[] = [];
    for (const step of clean.steps) {
      const created = await tx.flowStep.create({
        data: {
          orgId: user.orgId,
          flowId: flow.id,
          branch: step.branch,
          position: step.position,
          waitDays: step.waitDays,
          actionType: step.actionType,
          actionConfig: step.actionConfig as Prisma.InputJsonValue,
          branchAfterDays: step.branchAfterDays ?? null,
        },
        select: { id: true },
      });
      stepIds.push(created.id);
    }

    for (const [index, cond] of clean.conditions.entries()) {
      await tx.flowCondition.create({
        data: {
          orgId: user.orgId,
          flowId: flow.id,
          stepId: cond.stepIndex === null || cond.stepIndex === undefined ? null : (stepIds[cond.stepIndex] ?? null),
          type: cond.type,
          config: cond.config as Prisma.InputJsonValue,
          negated: cond.negated ?? false,
          position: index,
        },
      });
    }

    return flow.id;
  });

  return { ok: true, id };
}

/**
 * Borrador ⟷ activo ⟷ pausado.
 *
 * Pasar de borrador a ACTIVO exige que el flujo siga siendo válido: entre que
 * se montó y que se enciende puede haberse desactivado la etiqueta que
 * segmenta, y encender a ciegas es encender sobre socios de verdad.
 */
export async function setFlowStatus(user: ScopedUser, flowId: string, status: FlowStatus): Promise<FlowActionResult> {
  if (!canManageMembers(user.role)) return { ok: false, error: NO_PERMISSION };

  const flow = await getFlow(user, flowId);
  if (!flow) return { ok: false, error: NOT_FOUND };

  if (status === "ACTIVE") {
    const validation = validateFlow({
      name: flow.name,
      description: flow.description,
      centerId: flow.centerId,
      triggerType: flow.triggerType,
      triggerConfig: (flow.triggerConfig ?? {}) as Record<string, unknown>,
      goalKind: flow.goalKind,
      conditions: flow.conditions.map((c) => ({
        type: c.type,
        config: (c.config ?? {}) as Record<string, unknown>,
        negated: c.negated,
        stepIndex: c.stepId ? flow.steps.findIndex((s) => s.id === c.stepId) : null,
      })),
      steps: flow.steps.map((s) => ({
        branch: s.branch,
        position: s.position,
        waitDays: s.waitDays,
        actionType: s.actionType,
        actionConfig: (s.actionConfig ?? {}) as Record<string, unknown>,
        branchAfterDays: s.branchAfterDays,
      })),
    });
    if (!validation.ok) {
      return { ok: false, error: `No se puede activar: ${validation.issues[0]?.message}`, issues: validation.issues };
    }
  }

  await prisma.flow.update({ where: { id: flowId }, data: { status } });
  return { ok: true };
}

/**
 * Los centros en los que quien mira puede montar un flujo. `null` de
 * `centerScopeFor` es dirección de organización: se resuelve a la lista
 * explícita de centros, nunca a un «todos» tácito.
 */
export async function centersForFlows(user: ScopedUser): Promise<{ id: string; name: string }[]> {
  const scope = await centerScopeFor(user);
  if (scope !== null && scope.length === 0) return [];
  return prisma.center.findMany({
    where: { orgId: user.orgId, ...(scope === null ? {} : { id: { in: scope } }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

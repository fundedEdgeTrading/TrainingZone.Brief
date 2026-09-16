import type { FlowGoalKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { FLOW_GOAL_DEFINITION, FLOW_GOAL_LABEL } from "@/lib/flows/catalog";

/**
 * E14-29 · EL ARMAZÓN DEL PANEL POR FLUJO.
 *
 * Tres cifras y solo tres: **entran**, **hacen clic** y **cumplen el objetivo**.
 *
 * NO SE MIDEN APERTURAS (D-L3-4). Si alguien pregunta por la tasa de apertura,
 * la respuesta es el clic: medir aperturas exige un píxel de traza y con él un
 * CMP con «rechazar todo» al mismo nivel visual que «aceptar todo» en el mismo
 * cambio. El clic no necesita nada de eso porque el enlace es nuestro.
 *
 * ┌─ EL HUECO DEL OBJETIVO, tipado y documentado ────────────────────────────┐
 * │ E2 deja la TERCERA CIFRA construida pero sin resolver: `FlowGoalKind` es  │
 * │ el catálogo, `FlowEnrollment.goalMetAt` es dónde se escribe, y            │
 * │ `FlowGoalResolver` es la firma que hay que implementar. QUÉ objetivo      │
 * │ lleva cada uno de los seis flujos de salida —y cómo se mide contra datos  │
 * │ que YA existen— lo decide E3, que es quien los escribe.                   │
 * │                                                                          │
 * │ La definición de cada objetivo se pinta EN LA PROPIA PANTALLA             │
 * │ (`FLOW_GOAL_DEFINITION`): un embudo cuyo último paso nadie sabe medir es  │
 * │ un embudo decorativo.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * La firma que implementa E3, una por objetivo.
 *
 * Recibe las inscripciones con la fecha del correo que hay que superar y
 * devuelve las que YA cumplieron, con cuándo. El motor se encarga de escribir
 * `goalMetAt`: quien implemente esto no toca la base de datos de escritura, y
 * así un objetivo mal medido no puede corromper la cola.
 */
export type FlowGoalCandidate = {
  enrollmentId: string;
  memberId: string;
  /** El primer correo que salió de esta inscripción: el objetivo es POSTERIOR a él. */
  firstEmailAt: Date;
};

export type FlowGoalHit = { enrollmentId: string; metAt: Date };

export type FlowGoalResolver = (
  orgId: string,
  candidates: FlowGoalCandidate[],
  now: Date
) => Promise<FlowGoalHit[]>;

/**
 * El registro de resolutores. Empieza VACÍO a propósito: E2 monta la máquina,
 * no los flujos. E3 registra aquí el suyo por cada objetivo que use, y la
 * pantalla ya sabe pintarlo sin tocar nada más.
 */
const GOAL_RESOLVERS = new Map<FlowGoalKind, FlowGoalResolver>();

export function registerFlowGoalResolver(kind: FlowGoalKind, resolver: FlowGoalResolver): void {
  GOAL_RESOLVERS.set(kind, resolver);
}

export function flowGoalResolverFor(kind: FlowGoalKind): FlowGoalResolver | null {
  return GOAL_RESOLVERS.get(kind) ?? null;
}

export function hasFlowGoalResolver(kind: FlowGoalKind | null): boolean {
  return kind !== null && GOAL_RESOLVERS.has(kind);
}

/* ------------------------------------------------------------------------- *
 * El embudo
 * ------------------------------------------------------------------------- */

export type FlowFunnel = {
  flowId: string;
  /** Cuántos han entrado en el flujo (inscripciones, vivas o no). */
  entered: number;
  /** Cuántos de los que entraron recibieron al menos un correo de verdad. */
  emailed: number;
  /** Cuántos hicieron clic. La apertura NO se mide. */
  clicked: number;
  /** Cuántos cumplieron el objetivo. `null` = el flujo no tiene objetivo definido. */
  goalMet: number | null;
  goalKind: FlowGoalKind | null;
  goalLabel: string | null;
  goalDefinition: string | null;
  /**
   * `true` cuando el flujo declara objetivo pero nadie ha registrado todavía
   * cómo se mide. La pantalla lo dice en vez de pintar un cero: un cero y un
   * «no se sabe medir» no son lo mismo y confundirlos es peor que no enseñarlo.
   */
  goalPending: boolean;
  /** Enviados de verdad y enviados al buzón de pruebas, por separado. */
  sent: number;
  sentTest: number;
};

/** El embudo de un flujo. Cinco agregados, ninguna consulta por socio. */
export async function flowFunnel(orgId: string, flowId: string): Promise<FlowFunnel> {
  const flow = await prisma.flow.findFirst({
    where: { id: flowId, orgId },
    select: { id: true, goalKind: true },
  });
  if (!flow) {
    return {
      flowId,
      entered: 0,
      emailed: 0,
      clicked: 0,
      goalMet: null,
      goalKind: null,
      goalLabel: null,
      goalDefinition: null,
      goalPending: false,
      sent: 0,
      sentTest: 0,
    };
  }

  const [entered, goalMet, sent, sentTest, clicked, emailedRows] = await Promise.all([
    prisma.flowEnrollment.count({ where: { orgId, flowId } }),
    prisma.flowEnrollment.count({ where: { orgId, flowId, goalMetAt: { not: null } } }),
    prisma.flowEmailLog.count({ where: { orgId, flowId, testMode: false } }),
    prisma.flowEmailLog.count({ where: { orgId, flowId, testMode: true } }),
    // Socios DISTINTOS que hicieron clic, no clics: un socio que pulsa dos
    // veces no es dos personas, y el embudo cuenta personas.
    prisma.flowEmailLog
      .findMany({ where: { orgId, flowId, clickedAt: { not: null } }, select: { memberId: true }, distinct: ["memberId"] })
      .then((rows) => rows.length),
    prisma.flowEmailLog.findMany({
      where: { orgId, flowId, testMode: false },
      select: { memberId: true },
      distinct: ["memberId"],
    }),
  ]);

  const goalPending = flow.goalKind !== null && !hasFlowGoalResolver(flow.goalKind);

  return {
    flowId,
    entered,
    emailed: emailedRows.length,
    clicked,
    goalMet: flow.goalKind ? goalMet : null,
    goalKind: flow.goalKind,
    goalLabel: flow.goalKind ? FLOW_GOAL_LABEL[flow.goalKind] : null,
    goalDefinition: flow.goalKind ? FLOW_GOAL_DEFINITION[flow.goalKind] : null,
    goalPending,
    sent,
    sentTest,
  };
}

/**
 * Recalcula el objetivo de un flujo con el resolutor de su tipo. Lo llama el
 * cron después de la pasada del motor; sin resolutor registrado no hace nada y
 * lo dice devolviendo 0, que es distinto de «nadie lo cumplió».
 */
export async function refreshFlowGoals(orgId: string, flowId: string, now: Date = new Date()): Promise<number> {
  const flow = await prisma.flow.findFirst({ where: { id: flowId, orgId }, select: { goalKind: true } });
  if (!flow?.goalKind) return 0;

  const resolver = flowGoalResolverFor(flow.goalKind);
  if (!resolver) return 0;

  const pendientes = await prisma.flowEnrollment.findMany({
    where: { orgId, flowId, goalMetAt: null },
    select: {
      id: true,
      memberId: true,
      emails: { where: { testMode: false }, orderBy: { sentAt: "asc" }, take: 1, select: { sentAt: true } },
    },
  });

  const candidates: FlowGoalCandidate[] = pendientes
    .filter((e) => e.emails.length > 0)
    .map((e) => ({ enrollmentId: e.id, memberId: e.memberId, firstEmailAt: e.emails[0].sentAt }));
  if (candidates.length === 0) return 0;

  const hits = await resolver(orgId, candidates, now);
  for (const hit of hits) {
    await prisma.flowEnrollment.updateMany({
      where: { id: hit.enrollmentId, orgId, goalMetAt: null },
      data: { goalMetAt: hit.metAt },
    });
  }
  return hits.length;
}

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { MesocyclePlan } from "@/lib/ai/mesocycle-schema";
import type { MesocycleConversation } from "@/lib/ai/mesocycle-generator";

export type MesocycleWriteResult = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Mesociclo no encontrado.";
// Archivar no tiene vuelta atrás desde la UI (el botón desaparece una vez
// archivado): sin este guardia, editar cualquier campo de un mesociclo
// ARCHIVED lo devolvía a DRAFT en silencio (vía `backToDraft()`), así que el
// archivado no era en realidad un estado terminal.
const ARCHIVED_ERROR = "Este mesociclo está archivado y no se puede editar.";

/** Árbol completo tal y como lo pinta el editor. */
const detailInclude = {
  phases: {
    orderBy: { order: "asc" },
    include: {
      days: {
        orderBy: { order: "asc" },
        include: {
          blocks: {
            orderBy: { order: "asc" },
            include: { exercises: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  },
} satisfies Prisma.MesocycleInclude;

export type MesocycleDetail = Prisma.MesocycleGetPayload<{ include: typeof detailInclude }>;

export async function listMesocyclesForMember(orgId: string, memberId: string) {
  return prisma.mesocycle.findMany({
    where: { orgId, memberId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, profile: true, createdAt: true, approvedAt: true },
  });
}

export async function getMesocycleDetail(orgId: string, mesocycleId: string): Promise<MesocycleDetail | null> {
  return prisma.mesocycle.findFirst({ where: { id: mesocycleId, orgId }, include: detailInclude });
}

/**
 * RB innegociable (§7.4): el mesociclo nace en DRAFT. Nada que salga de un
 * modelo llega al socio sin que una persona cualificada lo firme.
 */
export async function createMesocycleFromPlan({
  orgId,
  memberId,
  createdByUserId,
  plan,
  conversation,
}: {
  orgId: string;
  memberId: string;
  createdByUserId: string;
  plan: MesocyclePlan;
  conversation: MesocycleConversation;
}): Promise<{ ok: true; mesocycleId: string } | { ok: false; error: string }> {
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const mesocycle = await prisma.mesocycle.create({
    data: {
      orgId,
      memberId,
      createdByUserId,
      status: "DRAFT",
      ...planHeader(plan),
      aiConversation: conversation as unknown as Prisma.InputJsonValue,
      phases: { create: planPhases(plan) },
    },
    select: { id: true },
  });

  return { ok: true, mesocycleId: mesocycle.id };
}

/**
 * Sustituye el árbol entero por el plan refinado. Se borran las fases (el resto
 * cuelga en cascada) y se recrean: reconciliar nodo a nodo con lo que devuelve
 * el modelo costaría más de lo que vale y dejaría IDs huérfanos.
 */
export async function replaceMesocyclePlan({
  orgId,
  mesocycleId,
  plan,
  conversation,
}: {
  orgId: string;
  mesocycleId: string;
  plan: MesocyclePlan;
  conversation: MesocycleConversation;
}): Promise<MesocycleWriteResult> {
  const existing = await prisma.mesocycle.findFirst({ where: { id: mesocycleId, orgId }, select: { id: true, status: true } });
  if (!existing) return { ok: false, error: NOT_FOUND };
  if (existing.status === "ARCHIVED") return { ok: false, error: ARCHIVED_ERROR };

  await prisma.$transaction([
    prisma.mesocyclePhase.deleteMany({ where: { mesocycleId } }),
    prisma.mesocycle.update({
      where: { id: mesocycleId },
      data: {
        ...planHeader(plan),
        ...backToDraft(),
        aiConversation: conversation as unknown as Prisma.InputJsonValue,
        phases: { create: planPhases(plan) },
      },
    }),
  ]);

  return { ok: true };
}

/** El plan vigente en el formato que entiende el refinado. */
export function toPlan(detail: MesocycleDetail): MesocyclePlan {
  return {
    title: detail.title,
    objective: detail.objective,
    profile: detail.profile,
    safetyCriteria: asStringArray(detail.safetyCriteria),
    weeklyLayout: asStringArray(detail.weeklyLayout),
    milestones: asMilestones(detail.milestones),
    phases: detail.phases.map((phase) => ({
      name: phase.name,
      weekFrom: phase.weekFrom,
      weekTo: phase.weekTo,
      notes: phase.notes,
      days: phase.days.map((day) => ({
        label: day.label,
        venue: day.venue,
        focus: day.focus,
        warmup: asStringArray(day.warmup),
        blocks: day.blocks.map((block) => ({
          name: block.name,
          durationMin: block.durationMin,
          exercises: block.exercises.map((exercise) => ({
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            load: exercise.load,
            description: exercise.description,
            rationale: exercise.rationale,
          })),
        })),
      })),
    })),
  };
}

export function conversationOf(detail: MesocycleDetail): MesocycleConversation {
  return Array.isArray(detail.aiConversation) ? (detail.aiConversation as unknown as MesocycleConversation) : [];
}

/** La firma del entrenador: es lo que saca el mesociclo del borrador. */
export async function approveMesocycle(
  orgId: string,
  mesocycleId: string,
  approvedByUserId: string
): Promise<MesocycleWriteResult> {
  const { count } = await prisma.mesocycle.updateMany({
    where: { id: mesocycleId, orgId, status: "DRAFT" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId },
  });
  return count === 0 ? { ok: false, error: "El mesociclo ya no está en borrador." } : { ok: true };
}

export async function archiveMesocycle(orgId: string, mesocycleId: string): Promise<MesocycleWriteResult> {
  const { count } = await prisma.mesocycle.updateMany({
    where: { id: mesocycleId, orgId },
    data: { status: "ARCHIVED" },
  });
  return count === 0 ? { ok: false, error: NOT_FOUND } : { ok: true };
}

export async function updateMesocycleHeader(
  orgId: string,
  mesocycleId: string,
  input: { title: string; objective: string; safetyCriteria: string[] }
): Promise<MesocycleWriteResult> {
  const existing = await prisma.mesocycle.findFirst({ where: { id: mesocycleId, orgId }, select: { status: true } });
  if (!existing) return { ok: false, error: NOT_FOUND };
  if (existing.status === "ARCHIVED") return { ok: false, error: ARCHIVED_ERROR };

  await prisma.mesocycle.update({ where: { id: mesocycleId }, data: { ...input, ...backToDraft() } });
  return { ok: true };
}

export async function updateMesocyclePhase(
  orgId: string,
  phaseId: string,
  input: { name: string; notes: string | null }
): Promise<MesocycleWriteResult> {
  const phase = await prisma.mesocyclePhase.findFirst({
    where: { id: phaseId, mesocycle: { orgId } },
    select: { mesocycleId: true, mesocycle: { select: { status: true } } },
  });
  if (!phase) return { ok: false, error: NOT_FOUND };
  if (phase.mesocycle.status === "ARCHIVED") return { ok: false, error: ARCHIVED_ERROR };

  await prisma.$transaction([
    prisma.mesocyclePhase.update({ where: { id: phaseId }, data: input }),
    prisma.mesocycle.update({ where: { id: phase.mesocycleId }, data: backToDraft() }),
  ]);
  return { ok: true };
}

export async function updateMesocycleDay(
  orgId: string,
  dayId: string,
  input: { focus: string; venue: string; warmup: string[] }
): Promise<MesocycleWriteResult> {
  const day = await prisma.mesocycleDay.findFirst({
    where: { id: dayId, phase: { mesocycle: { orgId } } },
    select: { phase: { select: { mesocycleId: true, mesocycle: { select: { status: true } } } } },
  });
  if (!day) return { ok: false, error: NOT_FOUND };
  if (day.phase.mesocycle.status === "ARCHIVED") return { ok: false, error: ARCHIVED_ERROR };

  await prisma.$transaction([
    prisma.mesocycleDay.update({ where: { id: dayId }, data: input }),
    prisma.mesocycle.update({ where: { id: day.phase.mesocycleId }, data: backToDraft() }),
  ]);
  return { ok: true };
}

export async function updateMesocycleExercise(
  orgId: string,
  exerciseId: string,
  input: { name: string; sets: number; reps: string; load: string | null; description: string; rationale: string }
): Promise<MesocycleWriteResult> {
  const exercise = await prisma.mesocycleExercise.findFirst({
    where: { id: exerciseId, block: { day: { phase: { mesocycle: { orgId } } } } },
    select: {
      block: { select: { day: { select: { phase: { select: { mesocycleId: true, mesocycle: { select: { status: true } } } } } } } },
    },
  });
  if (!exercise) return { ok: false, error: "Ejercicio no encontrado." };
  if (exercise.block.day.phase.mesocycle.status === "ARCHIVED") return { ok: false, error: ARCHIVED_ERROR };

  await prisma.$transaction([
    prisma.mesocycleExercise.update({ where: { id: exerciseId }, data: input }),
    prisma.mesocycle.update({
      where: { id: exercise.block.day.phase.mesocycleId },
      data: backToDraft(),
    }),
  ]);
  return { ok: true };
}

export async function deleteMesocycleExercise(orgId: string, exerciseId: string): Promise<MesocycleWriteResult> {
  const exercise = await prisma.mesocycleExercise.findFirst({
    where: { id: exerciseId, block: { day: { phase: { mesocycle: { orgId } } } } },
    select: {
      block: {
        select: {
          _count: { select: { exercises: true } },
          day: { select: { phase: { select: { mesocycleId: true, mesocycle: { select: { status: true } } } } } },
        },
      },
    },
  });
  if (!exercise) return { ok: false, error: "Ejercicio no encontrado." };
  if (exercise.block.day.phase.mesocycle.status === "ARCHIVED") return { ok: false, error: ARCHIVED_ERROR };
  // MesocycleBlockSchema exige al menos un ejercicio por bloque: sin esta
  // comprobación, un bloque se quedaba vacío, el siguiente refinado lo
  // mandaba tal cual como "Plan vigente", la salida del modelo dejaba de
  // validar contra el schema y el mesociclo quedaba irrecuperable desde la UI
  // (no existe ninguna acción para volver a añadir un ejercicio).
  if (exercise.block._count.exercises <= 1) {
    return { ok: false, error: "No se puede borrar el último ejercicio de un bloque." };
  }

  await prisma.$transaction([
    prisma.mesocycleExercise.delete({ where: { id: exerciseId } }),
    prisma.mesocycle.update({
      where: { id: exercise.block.day.phase.mesocycleId },
      data: backToDraft(),
    }),
  ]);
  return { ok: true };
}

/**
 * Tocar un mesociclo ya aprobado lo devuelve a borrador: la aprobación es la
 * firma de un plan concreto (§7.4), no un sello permanente sobre el registro.
 */
function backToDraft() {
  return { status: "DRAFT", approvedAt: null, approvedByUserId: null } as const;
}

function planHeader(plan: MesocyclePlan) {
  return {
    title: plan.title,
    objective: plan.objective,
    profile: plan.profile,
    safetyCriteria: plan.safetyCriteria,
    weeklyLayout: plan.weeklyLayout,
    milestones: plan.milestones,
  };
}

function planPhases(plan: MesocyclePlan): Prisma.MesocyclePhaseCreateWithoutMesocycleInput[] {
  return plan.phases.map((phase, phaseIndex) => ({
    order: phaseIndex,
    name: phase.name,
    weekFrom: phase.weekFrom,
    weekTo: phase.weekTo,
    notes: phase.notes,
    days: {
      create: phase.days.map((day, dayIndex) => ({
        order: dayIndex,
        label: day.label,
        venue: day.venue,
        focus: day.focus,
        warmup: day.warmup,
        blocks: {
          create: day.blocks.map((block, blockIndex) => ({
            order: blockIndex,
            name: block.name,
            durationMin: block.durationMin,
            exercises: {
              create: block.exercises.map((exercise, exerciseIndex) => ({
                order: exerciseIndex,
                name: exercise.name,
                sets: exercise.sets,
                reps: exercise.reps,
                load: exercise.load,
                description: exercise.description,
                rationale: exercise.rationale,
              })),
            },
          })),
        },
      })),
    },
  }));
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asMilestones(value: Prisma.JsonValue): MesocyclePlan["milestones"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { week, milestone } = entry as Record<string, unknown>;
    return typeof week === "number" && typeof milestone === "string" ? [{ week, milestone }] : [];
  });
}

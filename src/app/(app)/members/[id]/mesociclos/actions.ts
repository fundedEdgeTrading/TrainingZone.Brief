"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { requireRole, memberIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMesocycleBriefingForMember } from "@/lib/health-access";
import { generateMesocyclePlan, refineMesocyclePlan } from "@/lib/ai/mesocycle-generator";
import {
  approveMesocycle,
  archiveMesocycle,
  conversationOf,
  createMesocycleFromPlan,
  deleteMesocycleExercise,
  getMesocycleDetail,
  replaceMesocyclePlan,
  toPlan,
  updateMesocycleDay,
  updateMesocycleExercise,
  updateMesocycleHeader,
  updateMesocyclePhase,
} from "@/lib/mesocycle-queries";

const MESOCYCLE_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"];

export type MesocycleActionResult = { ok: true } | { ok: false; error: string };
export type GenerateResult = { ok: true; mesocycleId: string } | { ok: false; error: string };

function revalidateMesocycle(memberId: string, mesocycleId?: string) {
  revalidatePath(`/members/${memberId}`);
  if (mesocycleId) revalidatePath(`/members/${memberId}/mesociclos/${mesocycleId}`);
}


/**
 * Ámbito de centro de un mesociclo — y de cualquier pieza suya.
 *
 * El socio se deduce SIEMPRE del objeto que se va a tocar, nunca del `memberId`
 * que manda el cliente (que solo sirve para revalidar rutas): con el par
 * "mi socio + el id de una fase ajena" se editaba el plan de un socio de otro
 * centro, porque las consultas solo acotaban por organización.
 */
async function ownerOfMesocycleTarget(
  orgId: string,
  target: { mesocycleId?: string; phaseId?: string; dayId?: string; exerciseId?: string }
): Promise<string | null> {
  if (target.exerciseId) {
    const row = await prisma.mesocycleExercise.findFirst({
      where: { id: target.exerciseId, block: { day: { phase: { mesocycle: { orgId } } } } },
      select: { block: { select: { day: { select: { phase: { select: { mesocycle: { select: { memberId: true } } } } } } } } },
    });
    return row?.block.day.phase.mesocycle.memberId ?? null;
  }
  if (target.dayId) {
    const row = await prisma.mesocycleDay.findFirst({
      where: { id: target.dayId, phase: { mesocycle: { orgId } } },
      select: { phase: { select: { mesocycle: { select: { memberId: true } } } } },
    });
    return row?.phase.mesocycle.memberId ?? null;
  }
  if (target.phaseId) {
    const row = await prisma.mesocyclePhase.findFirst({
      where: { id: target.phaseId, mesocycle: { orgId } },
      select: { mesocycle: { select: { memberId: true } } },
    });
    return row?.mesocycle.memberId ?? null;
  }
  if (target.mesocycleId) {
    const row = await prisma.mesocycle.findFirst({
      where: { id: target.mesocycleId, orgId },
      select: { memberId: true },
    });
    return row?.memberId ?? null;
  }
  return null;
}

/** `null` si pasa; si no, el mensaje de error listo para devolver. */
async function mesocycleScopeError(
  user: { id: string; role: Role; orgId: string; centerId: string | null },
  target: { mesocycleId?: string; phaseId?: string; dayId?: string; exerciseId?: string }
): Promise<string | null> {
  const ownerId = await ownerOfMesocycleTarget(user.orgId, target);
  if (!ownerId) return "No se ha encontrado ese mesociclo.";
  return (await memberIsInScope(user, ownerId)) ? null : OUT_OF_CENTER_SCOPE;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-*·]\s*/, "").trim())
    .filter(Boolean);
}

export async function generateMesocycleAction(
  memberId: string,
  input: { level: string; weeks: number; availability: string }
): Promise<GenerateResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  if (!(await memberIsInScope(session.user, memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  const availability = lines(input.availability);
  if (availability.length === 0) return { ok: false, error: "Indica al menos un día de disponibilidad." };
  if (!Number.isInteger(input.weeks) || input.weeks < 4 || input.weeks > 12) {
    return { ok: false, error: "El mesociclo va de 4 a 12 semanas." };
  }

  // Único punto por el que salen datos del socio: seudonimiza y audita.
  const briefing = await getMesocycleBriefingForMember({
    memberId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    level: input.level,
    weeks: input.weeks,
    availability,
  });
  if (!briefing) return { ok: false, error: "No se pudo preparar la ficha para la generación." };

  const generated = await generateMesocyclePlan(briefing);
  if (!generated.ok) return generated;

  const created = await createMesocycleFromPlan({
    orgId: session.user.orgId,
    memberId,
    createdByUserId: session.user.id,
    plan: generated.plan,
    conversation: generated.conversation,
  });
  if (!created.ok) return created;

  revalidateMesocycle(memberId, created.mesocycleId);
  return created;
}

export async function refineMesocycleAction(
  memberId: string,
  mesocycleId: string,
  request: string
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  if (!request.trim()) return { ok: false, error: "Escribe qué quieres cambiar." };

  const detail = await getMesocycleDetail(session.user.orgId, mesocycleId);
  if (!detail) return { ok: false, error: "Mesociclo no encontrado." };
  if (!(await memberIsInScope(session.user, detail.memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  // Antes de gastar una llamada al modelo: un mesociclo archivado no se edita
  // (`replaceMesocyclePlan` lo rechazaría igual al guardar, pero sin este
  // corte se pagaba la generación entera para nada).
  if (detail.status === "ARCHIVED") return { ok: false, error: "Este mesociclo está archivado y no se puede editar." };

  const refined = await refineMesocyclePlan({
    plan: toPlan(detail),
    conversation: conversationOf(detail),
    request: request.trim(),
  });
  if (!refined.ok) return refined;

  const result = await replaceMesocyclePlan({
    orgId: session.user.orgId,
    mesocycleId,
    plan: refined.plan,
    conversation: refined.conversation,
  });
  if (!result.ok) return result;

  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function approveMesocycleAction(
  memberId: string,
  mesocycleId: string
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  const scopeError = await mesocycleScopeError(session.user, { mesocycleId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await approveMesocycle(session.user.orgId, mesocycleId, session.user.id);
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function archiveMesocycleAction(
  memberId: string,
  mesocycleId: string
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  const scopeError = await mesocycleScopeError(session.user, { mesocycleId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await archiveMesocycle(session.user.orgId, mesocycleId);
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function updateMesocycleHeaderAction(
  memberId: string,
  mesocycleId: string,
  input: { title: string; objective: string; safetyCriteria: string }
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  if (!input.title.trim()) return { ok: false, error: "El mesociclo necesita un título." };

  const scopeError = await mesocycleScopeError(session.user, { mesocycleId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await updateMesocycleHeader(session.user.orgId, mesocycleId, {
    title: input.title.trim(),
    objective: input.objective.trim(),
    safetyCriteria: lines(input.safetyCriteria),
  });
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function updateMesocyclePhaseAction(
  memberId: string,
  mesocycleId: string,
  phaseId: string,
  input: { name: string; notes: string }
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  if (!input.name.trim()) return { ok: false, error: "La fase necesita un nombre." };

  const scopeError = await mesocycleScopeError(session.user, { phaseId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await updateMesocyclePhase(session.user.orgId, phaseId, {
    name: input.name.trim(),
    notes: input.notes.trim() || null,
  });
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function updateMesocycleDayAction(
  memberId: string,
  mesocycleId: string,
  dayId: string,
  input: { focus: string; venue: string; warmup: string }
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  const warmup = lines(input.warmup);
  if (warmup.length === 0) return { ok: false, error: "Todo día lleva calentamiento." };

  const scopeError = await mesocycleScopeError(session.user, { dayId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await updateMesocycleDay(session.user.orgId, dayId, {
    focus: input.focus.trim(),
    venue: input.venue.trim(),
    warmup,
  });
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function updateMesocycleExerciseAction(
  memberId: string,
  mesocycleId: string,
  exerciseId: string,
  input: { name: string; sets: number; reps: string; load: string; description: string; rationale: string }
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  if (!input.name.trim()) return { ok: false, error: "El ejercicio necesita un nombre." };
  if (!Number.isInteger(input.sets) || input.sets < 1) return { ok: false, error: "Las series son un entero positivo." };
  // El porqué no es opcional: es lo que separa el mesociclo de una plantilla.
  if (!input.rationale.trim()) return { ok: false, error: "Falta el porqué del ejercicio." };

  const scopeError = await mesocycleScopeError(session.user, { exerciseId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await updateMesocycleExercise(session.user.orgId, exerciseId, {
    name: input.name.trim(),
    sets: input.sets,
    reps: input.reps.trim(),
    load: input.load.trim() || null,
    description: input.description.trim(),
    rationale: input.rationale.trim(),
  });
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

export async function deleteMesocycleExerciseAction(
  memberId: string,
  mesocycleId: string,
  exerciseId: string
): Promise<MesocycleActionResult> {
  const session = await requireRole(MESOCYCLE_ROLES);
  const scopeError = await mesocycleScopeError(session.user, { exerciseId });
  if (scopeError) return { ok: false, error: scopeError };

  const result = await deleteMesocycleExercise(session.user.orgId, exerciseId);
  if (!result.ok) return result;
  revalidateMesocycle(memberId, mesocycleId);
  return { ok: true };
}

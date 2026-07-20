import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createNotificationOnce } from "@/lib/notifications";

/**
 * Agente de IA de programación (RB-IA-001/002/003). En este entorno de demo la
 * IA está MOCKEADA (generación determinista, sin proveedor externo) — lo que
 * importa para el negocio es que la rutina SIEMPRE pasa por confirmación
 * humana antes de llegar al cliente como definitiva, no la sofisticación del
 * generador. Sustituir `buildMockRoutine` por una llamada real no cambia el
 * resto del flujo.
 */
function buildMockRoutine(goals: string[]) {
  const base = [
    { day: "Lunes", blocks: ["Movilidad 10'", "Fuerza tren inferior 3x10", "Core 3x30\""] },
    { day: "Miércoles", blocks: ["Movilidad 10'", "Fuerza tren superior 3x10", "Cardio ligero 15'"] },
    { day: "Viernes", blocks: ["Movilidad 10'", "Full body 3x12", "Estiramientos 10'"] },
  ];
  return { goals, sessions: base, generatedAt: new Date().toISOString(), source: "mock-ai-v1" };
}

export type WorkoutWriteResult = { ok: true; programId: string } | { ok: false; error: string };

/** RB-IA-003: el cliente (o el entrenador) solicita una rutina; la IA la genera en DRAFT. */
export async function requestWorkoutProgram(orgId: string, memberId: string): Promise<WorkoutWriteResult> {
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true, trainerId: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const goals = await prisma.clientGoal.findMany({ where: { memberId, isTemplate: false }, select: { label: true } });
  const program = await prisma.workoutProgram.create({
    data: { orgId, memberId, createdByAI: true, status: "DRAFT", payload: buildMockRoutine(goals.map((g) => g.label)) },
  });

  if (member.trainerId) {
    await createNotificationOnce({
      orgId,
      recipientUserId: member.trainerId,
      kind: "TASK",
      title: "Rutina de IA pendiente de confirmar",
      body: "Un cliente tiene una rutina generada por IA esperando tu revisión antes de activarse (RB-IA-001/003).",
      entityType: "Member",
      entityId: memberId,
    });
  }
  return { ok: true, programId: program.id };
}

/** RB-IA-003: el entrenador asignado SIEMPRE confirma antes de activar. */
export async function confirmWorkoutProgram(orgId: string, programId: string, confirmedByUserId: string): Promise<WorkoutWriteResult> {
  const program = await prisma.workoutProgram.findFirst({ where: { id: programId, orgId }, select: { id: true, status: true, memberId: true } });
  if (!program) return { ok: false, error: "Rutina no encontrada." };
  if (program.status === "ACTIVE") return { ok: false, error: "Ya está activa." };
  await prisma.workoutProgram.update({ where: { id: programId }, data: { status: "ACTIVE", confirmedByUserId } });
  return { ok: true, programId };
}

export async function completeWorkoutProgram(orgId: string, programId: string): Promise<WorkoutWriteResult> {
  const program = await prisma.workoutProgram.findFirst({ where: { id: programId, orgId }, select: { id: true } });
  if (!program) return { ok: false, error: "Rutina no encontrada." };
  await prisma.workoutProgram.update({ where: { id: programId }, data: { status: "COMPLETED" } });
  return { ok: true, programId };
}

export async function listWorkoutPrograms(orgId: string, memberId: string) {
  return prisma.workoutProgram.findMany({ where: { orgId, memberId }, orderBy: { createdAt: "desc" } });
}

/**
 * RB-IA-005: autovaloración del cliente + "recomendación de IA" (mockeada:
 * regla simple sobre el texto/estructura, mismo principio que buildMockRoutine).
 */
export async function submitSelfAssessment(
  orgId: string,
  memberId: string,
  input: { kind: string; text?: string; structured?: Record<string, unknown> }
) {
  const stalled = input.structured?.stalled === true || (input.text ?? "").toLowerCase().includes("estanc");
  const aiRecommendation = stalled
    ? "Detectamos posible estancamiento. Tu entrenador se pondrá en contacto contigo para valorar un cambio (más días/semana, ajuste de objetivo o nutrición)."
    : "¡Sigue así! Registramos tu progreso y tu entrenador lo revisará en tu próximo check-in.";

  const assessment = await prisma.selfAssessment.create({
    data: { orgId, memberId, kind: input.kind, text: input.text, structured: input.structured as Prisma.InputJsonValue | undefined, aiRecommendation },
  });

  if (stalled) {
    const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { firstName: true, lastName: true, trainerId: true } });
    const directors = member?.trainerId
      ? [member.trainerId]
      : (await prisma.user.findMany({ where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] } }, select: { id: true } })).map((d) => d.id);
    for (const recipientUserId of directors) {
      await createNotificationOnce({
        orgId,
        recipientUserId,
        kind: "ALERT",
        title: `${member?.firstName} ${member?.lastName}: se siente estancado/a`,
        body: "Autovaloración del cliente (RB-IA-005). Contacta y valora una acción comercial.",
        entityType: "Member",
        entityId: memberId,
      });
    }
  }

  return { ok: true as const, assessmentId: assessment.id, aiRecommendation };
}

export async function listSelfAssessments(memberId: string) {
  return prisma.selfAssessment.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 10 });
}

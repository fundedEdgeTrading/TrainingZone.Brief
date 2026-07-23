"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { requestWorkoutProgram, submitSelfAssessment } from "@/lib/workout-programs";
import { submitTrainerRating } from "@/lib/trainer-rating-access";

export type PortalPlanResult = { ok: true } | { ok: false; error: string };

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

export async function requestWorkoutProgramAction(): Promise<PortalPlanResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "Socio no encontrado." };
  const result = await requestWorkoutProgram(ctx.session.user.orgId, ctx.member.id);
  if (!result.ok) return result;
  revalidatePath("/portal/plan");
  return { ok: true };
}

export async function submitSelfAssessmentAction(formData: FormData): Promise<PortalPlanResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "Socio no encontrado." };
  const text = String(formData.get("text") ?? "");
  const stalled = formData.get("stalled") === "on";
  await submitSelfAssessment(ctx.session.user.orgId, ctx.member.id, {
    kind: "autovaloracion",
    text,
    structured: { stalled },
  });
  revalidatePath("/portal/plan");
  return { ok: true };
}

export type SessionRatingInput = {
  trainerScore: number;
  tags: string[];
  energy: number;
  rpe: number;
  discomfort: string | null;
  completed: string | null;
};

const clampScale = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

/** Valoración de sesión (F16): puntuación 1-10 al entrenador + autoevaluación de energía/RPE. */
export async function submitSessionRatingAction(bookingId: string, input: SessionRatingInput): Promise<PortalPlanResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "Socio no encontrado." };

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, memberId: ctx.member.id, status: "ATTENDED" } });
  if (!booking) return { ok: false, error: "Esta reserva no corresponde a una sesión asistida tuya." };

  const trainerScore = clampScale(input.trainerScore);

  await prisma.selfAssessment.create({
    data: {
      orgId: ctx.session.user.orgId,
      memberId: ctx.member.id,
      kind: "post-sesion",
      structured: {
        bookingId,
        trainerScore,
        tags: input.tags,
        energy: clampScale(input.energy),
        rpe: clampScale(input.rpe),
        discomfort: input.discomfort,
        completed: input.completed,
      },
    },
  });

  if (ctx.member.trainerId) {
    await submitTrainerRating(ctx.session.user.orgId, ctx.session.user.id, { score: trainerScore });
  }

  revalidatePath("/portal/plan");
  revalidatePath("/portal/agenda");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { createMemberCheckout } from "@/lib/member-billing";
import { submitTrainerRating } from "@/lib/trainer-rating-access";

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

export type PortalBillingResult = { ok: true; url: string } | { ok: false; error: string };

/** F6: compra/recarga de bono desde el propio portal — mismo motor de checkout que recepción y la landing pública. */
export async function purchasePlan(planId: string): Promise<PortalBillingResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  return createMemberCheckout({
    orgId: ctx.session.user.orgId,
    memberId: ctx.member.id,
    planId,
    centerId: ctx.member.primaryCenterId,
    origin: "portal",
  });
}

export type PortalMembresiaResult = { ok: true } | { ok: false; error: string };

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
export async function submitSessionRatingAction(bookingId: string, input: SessionRatingInput): Promise<PortalMembresiaResult> {
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

  // submitTrainerRating ya no depende de un Member.trainerId fijo: resuelve
  // por sí solo el entrenador de la última sesión de EP asistida. Si el socio
  // no es de EP (p.ej. solo grupos) simplemente no hay a quién valorar y
  // devuelve error, que aquí no bloquea el resto de la valoración de sesión.
  await submitTrainerRating(ctx.session.user.orgId, ctx.session.user.id, { score: trainerScore });

  revalidatePath("/portal/membresia");
  revalidatePath("/portal/agenda");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, bookSessionForMember, cancelBookingForMember, type BookingResult } from "@/lib/portal-queries";

export type BookingActionResult = BookingResult;

export async function bookSession(sessionId: string): Promise<BookingActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const result = await bookSessionForMember(member, sessionId);
  if (!result.ok) return result;

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
  // La reserva cambia el aforo y el roster que ven el entrenador y el brief.
  revalidateSessionViews();
  return result;
}

export async function cancelMyBooking(bookingId: string): Promise<BookingActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const result = await cancelBookingForMember(member.id, bookingId);
  if (!result.ok) return result;

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
  // La reserva cambia el aforo y el roster que ven el entrenador y el brief.
  revalidateSessionViews();
  return result;
}

export type PostSessionFeedbackResult = { ok: true } | { ok: false; error: string };

const FEELINGS = ["GREEN", "AMBER", "RED"] as const;

/** FB-2/RB-FB-102: feedback ligero y opcional del cliente tras una sesión (reutiliza SelfAssessment). */
export async function submitPostSessionFeedback(
  bookingId: string,
  input: { feeling: (typeof FEELINGS)[number]; rpe?: number | null; comment?: string | null }
): Promise<PostSessionFeedbackResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };
  if (!FEELINGS.includes(input.feeling)) return { ok: false, error: "Selecciona cómo te has sentido." };

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, memberId: member.id, status: "ATTENDED" } });
  if (!booking) return { ok: false, error: "Esta reserva no corresponde a una sesión asistida tuya." };

  await prisma.selfAssessment.create({
    data: {
      orgId: session.user.orgId,
      memberId: member.id,
      kind: "post-sesion",
      text: input.comment?.trim() || null,
      structured: { bookingId, feeling: input.feeling, rpe: input.rpe ?? null },
    },
  });

  revalidatePath("/portal/agenda");
  return { ok: true };
}

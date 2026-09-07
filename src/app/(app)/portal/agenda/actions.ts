"use server";

import { revalidatePath } from "next/cache";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, bookSessionForMember, cancelBookingForMember, type BookingResult } from "@/lib/portal-queries";

export type BookingActionResult = BookingResult;

export async function bookSession(sessionId: string, occurrenceDate?: string): Promise<BookingActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const result = await bookSessionForMember(member, sessionId, occurrenceDate);
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

// E5-10: la valoración post-sesión (feeling GREEN/AMBER/RED + comentario, que
// alimenta el Session Brief del entrenador) se pide ahora en un solo sitio,
// junto con la valoración al entrenador — ver submitSessionRatingAction en
// portal/membresia/actions.ts.

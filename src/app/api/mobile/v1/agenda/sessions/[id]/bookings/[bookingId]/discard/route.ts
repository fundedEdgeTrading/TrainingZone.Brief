import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discardAttendeeAsStaff, getBookingCenterId } from "@/lib/agenda-queries";
import { isCenterInScope } from "@/lib/center-scope";
import { canAdjustSessionBalance } from "@/lib/rbac";
import { trainerDiscardEffect, describeDiscardEffect } from "@/lib/attendee-discard";
import { zonedTimeToInstant } from "@/lib/date-utils";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../../../_lib/response";

/**
 * Descarte de un asistente por el entrenador, con su ventana propia de 24 h
 * (`lib/attendee-discard.ts`). No es el DELETE de al lado: aquel es el reverso
 * de una reserva que hizo el propio staff y siempre devuelve el bono.
 *
 * GET devuelve el efecto ANTES de confirmar —es lo que la hoja de la app pinta
 * en el aviso verde o rojo— para que el entrenador no descubra que ha
 * consumido una sesión después de haberla consumido.
 */
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"];

async function loadBooking(orgId: string, bookingId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, session: { orgId }, status: { in: ["BOOKED", "WAITLISTED"] } },
    select: {
      id: true,
      status: true,
      subscriptionId: true,
      occurrenceDate: true,
      member: { select: { firstName: true, lastName: true } },
      subscription: {
        select: { sessionsRemaining: true, plan: { select: { name: true } } },
      },
      session: {
        select: { name: true, capacity: true, startTime: true, center: { select: { timezone: true } } },
      },
    },
  });
}

async function guard(req: NextRequest, bookingId: string) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const { claims } = auth;
  const centerId = await getBookingCenterId(claims.orgId, bookingId);
  if (!centerId) return { ok: false as const, response: apiError("No se ha encontrado esa reserva.", 404) };
  const inScope = await isCenterInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    centerId
  );
  if (!inScope) return { ok: false as const, response: apiError("No se ha encontrado esa reserva.", 404) };
  return { ok: true as const, claims };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const g = await guard(req, bookingId);
  if (!g.ok) return g.response;

  const booking = await loadBooking(g.claims.orgId, bookingId);
  if (!booking) return apiError("No se ha encontrado esa reserva activa.", 404);

  const startsAt = zonedTimeToInstant(booking.occurrenceDate, booking.session.startTime, booking.session.center.timezone);
  const canForceRefund = canAdjustSessionBalance(g.claims.role);
  const effect = trainerDiscardEffect({
    startsAt,
    now: new Date(),
    status: booking.status === "WAITLISTED" ? "WAITLISTED" : "BOOKED",
    hasSubscription: Boolean(booking.subscriptionId),
  });

  const remaining = booking.subscription?.sessionsRemaining ?? null;
  return apiOk({
    memberName: `${booking.member.firstName} ${booking.member.lastName}`.trim(),
    sessionName: booking.session.name,
    startsAt: startsAt.toISOString(),
    hoursUntil: Math.round(effect.hoursUntil * 10) / 10,
    withinWindow: effect.withinWindow,
    /** Qué pasa si se descarta sin tocar nada. */
    refundsByDefault: effect.refunds,
    /** El toggle «Devolver la sesión de todos modos» solo se ofrece con permiso. */
    canForceRefund,
    planName: booking.subscription?.plan.name ?? null,
    balanceBefore: remaining,
    balanceAfterIfRefunded: remaining == null ? null : remaining + 1,
    notice: describeDiscardEffect(effect),
  });
}

type Body = { reason?: string | null; forceRefund?: boolean; notifyMember?: boolean };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  const { id, bookingId } = await params;
  const g = await guard(req, bookingId);
  if (!g.ok) return g.response;
  const { claims } = g;

  const body = (await req.json().catch(() => null)) as Body | null;

  const result = await discardAttendeeAsStaff(claims.orgId, bookingId, {
    actorUserId: claims.sub,
    reason: body?.reason ?? null,
    forceRefund: body?.forceRefund === true,
    // El permiso lo decide el servidor por el rol del token, no el cuerpo.
    canForceRefund: canAdjustSessionBalance(claims.role),
    notifyMember: body?.notifyMember !== false,
  });
  if (!result.ok) return apiError(result.error, 400);

  revalidateSessionViews(id);
  return apiOk({ refunded: result.refunded, withinWindow: result.withinWindow, overridden: result.overridden });
}

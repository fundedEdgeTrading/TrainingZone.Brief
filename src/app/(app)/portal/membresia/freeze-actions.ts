"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, cancelBookingForMember } from "@/lib/portal-queries";
import { stripeForOrg } from "@/lib/stripe";
import {
  freezeMaxDaysPerYear,
  freezeMinNoticeDays,
  freezeDaysUsedThisYear,
  frozenDaysBetween,
  shiftedEndDate,
  FREEZE_ENTITY,
  FREEZE_ACTION,
  RESUME_ACTION,
} from "./freeze-view";

/**
 * E5-06: congelar/reanudar el bono desde el propio portal. Depende de
 * HU-ST-14 (`pause_collection` real en Stripe, pista Stripe, todavía sin
 * construir a la fecha de esta historia): se propaga `pause_collection` en
 * cuanto hay suscripción conectada, y degrada a "solo local" si Stripe no
 * está disponible, mismo patrón que `freezeSubscription` en `billing/`
 * cuando el gimnasio no tiene Stripe conectado.
 */

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

async function liveSubscription(memberId: string) {
  return prisma.subscription.findFirst({
    where: { memberId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: { id: true, endDate: true, stripeSubscriptionId: true },
  });
}

export type FreezeConflict = { bookingId: string; sessionName: string; dayLabel: string; startTime: string };
export type FreezePreviewResult =
  | { ok: true; conflicts: FreezeConflict[] }
  | { ok: false; error: string };

/** Reservas que caerían dentro del periodo elegido — para pedir una decisión explícita antes de congelar. */
export async function previewMemberFreeze(startDate: string, endDate: string): Promise<FreezePreviewResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "El periodo de congelación no es válido." };
  }

  const bookings = await prisma.booking.findMany({
    where: {
      memberId: ctx.member.id,
      status: "BOOKED",
      occurrenceDate: { gte: start, lte: end },
    },
    select: {
      id: true,
      occurrenceDate: true,
      session: { select: { name: true, startTime: true } },
    },
    orderBy: { occurrenceDate: "asc" },
  });

  return {
    ok: true,
    conflicts: bookings.map((b) => ({
      bookingId: b.id,
      sessionName: b.session.name,
      dayLabel: b.occurrenceDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }),
      startTime: b.session.startTime,
    })),
  };
}

export type FreezeActionResult = { ok: true } | { ok: false; error: string };

/** RB-PAGO-004 (espejo de socio): congela con fecha de fin obligatoria, dentro de los límites del centro. */
export async function requestMemberFreeze(
  startDate: string,
  endDate: string,
  cancelConflictingBookingIds: string[]
): Promise<FreezeActionResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "El periodo de congelación no es válido." };
  }

  const minNoticeDays = freezeMinNoticeDays();
  const noticeMs = start.getTime() - Date.now();
  if (noticeMs < minNoticeDays * 86_400_000) {
    return { ok: false, error: `Tienes que pedirlo con al menos ${minNoticeDays} días de antelación.` };
  }

  const subscription = await liveSubscription(ctx.member.id);
  if (!subscription) return { ok: false, error: "No tienes ningún bono activo que congelar." };

  const requestedDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const maxDaysPerYear = freezeMaxDaysPerYear();
  const usedDaysThisYear = await freezeDaysUsedThisYear(subscription.id);
  if (usedDaysThisYear + requestedDays > maxDaysPerYear) {
    return {
      ok: false,
      error: `Tu centro permite hasta ${maxDaysPerYear} días de congelación al año, y ya has usado ${usedDaysThisYear}.`,
    };
  }

  for (const bookingId of cancelConflictingBookingIds) {
    await cancelBookingForMember(ctx.member.id, bookingId);
  }

  if (subscription.stripeSubscriptionId) {
    const resolved = await stripeForOrg(ctx.session.user.orgId);
    if (resolved.ok) {
      try {
        await resolved.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { pause_collection: { behavior: "void", resumes_at: Math.floor(end.getTime() / 1000) } },
          { stripeAccount: resolved.accountId }
        );
      } catch {
        return { ok: false, error: "No se ha podido comunicar la congelación a Stripe. Inténtalo de nuevo en un momento." };
      }
    }
  }

  await prisma.$transaction([
    prisma.subscription.update({ where: { id: subscription.id }, data: { status: "FROZEN", pauseUntil: end } }),
    prisma.member.update({ where: { id: ctx.member.id }, data: { state: "FROZEN" } }),
  ]);
  await prisma.auditLog.create({
    data: {
      orgId: ctx.session.user.orgId,
      actorUserId: ctx.session.user.id,
      action: FREEZE_ACTION,
      entityType: FREEZE_ENTITY,
      entityId: subscription.id,
      memberId: ctx.member.id,
      metadata: { startDate: start, endDate: end, keptBookings: cancelConflictingBookingIds.length === 0 },
    },
  });

  revalidatePath("/portal/membresia");
  revalidatePath("/portal/agenda");
  return { ok: true };
}

/** Reanudar antes de tiempo: desplaza la caducidad los días que ha durado la congelación real. */
export async function resumeMemberFreeze(): Promise<FreezeActionResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const subscription = await prisma.subscription.findFirst({
    where: { memberId: ctx.member.id, status: "FROZEN" },
    orderBy: { startDate: "desc" },
    select: { id: true, endDate: true, stripeSubscriptionId: true },
  });
  if (!subscription) return { ok: false, error: "No tienes ninguna congelación activa." };

  const lastFreeze = await prisma.auditLog.findFirst({
    where: { entityType: FREEZE_ENTITY, entityId: subscription.id, action: FREEZE_ACTION },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, metadata: true },
  });
  const freezeStart = (() => {
    const metadata = lastFreeze?.metadata as { startDate?: string } | null;
    const fromMetadata = metadata?.startDate ? new Date(metadata.startDate) : null;
    return fromMetadata ?? lastFreeze?.createdAt ?? new Date();
  })();

  const now = new Date();
  const frozenDays = frozenDaysBetween(freezeStart, now);
  const newEndDate = shiftedEndDate(subscription.endDate, frozenDays);

  if (subscription.stripeSubscriptionId) {
    const resolved = await stripeForOrg(ctx.session.user.orgId);
    if (resolved.ok) {
      try {
        await resolved.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { pause_collection: null },
          { stripeAccount: resolved.accountId }
        );
      } catch {
        return { ok: false, error: "No se ha podido reanudar en Stripe. Inténtalo de nuevo en un momento." };
      }
    }
  }

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", pauseUntil: null, ...(newEndDate ? { endDate: newEndDate } : {}) },
    }),
    prisma.member.update({ where: { id: ctx.member.id }, data: { state: "ACTIVE" } }),
  ]);
  await prisma.auditLog.create({
    data: {
      orgId: ctx.session.user.orgId,
      actorUserId: ctx.session.user.id,
      action: RESUME_ACTION,
      entityType: FREEZE_ENTITY,
      entityId: subscription.id,
      memberId: ctx.member.id,
      metadata: { frozenDays, newEndDate },
    },
  });

  revalidatePath("/portal/membresia");
  return { ok: true };
}

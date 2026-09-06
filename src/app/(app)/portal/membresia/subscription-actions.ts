"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { stripeForOrg } from "@/lib/stripe";
import { createMemberBillingPortalSession, isRecurring } from "@/lib/member-billing";

/**
 * E5-01: autoservicio de baja/gestión de pago desde el propio portal — hoy
 * para darse de baja hay que salir a la web pública y pedir un enlace por
 * email. Depende de HU-ST-15 (baja real en Stripe, pista Stripe) y de
 * HU-ST-17 (`createMemberBillingPortalSession`, que ya existe y no estaba
 * enlazada desde ningún sitio). Mientras HU-ST-15 no llegue, la baja
 * propaga `cancel_at_period_end` directamente a Stripe cuando hay
 * suscripción conectada, y degrada a "solo local + aviso" si Stripe no está
 * disponible — igual que hace `freezeSubscription` en `billing/` cuando el
 * gimnasio no tiene Stripe conectado.
 */

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

/** RB-PAGO-006 (espejo de socio): última suscripción viva, la única que tiene sentido dar de baja. */
async function latestLiveSubscription(memberId: string) {
  return prisma.subscription.findFirst({
    where: { memberId, status: { in: ["ACTIVE", "FROZEN"] } },
    orderBy: { startDate: "desc" },
    select: { id: true, endDate: true, cancelAt: true, stripeSubscriptionId: true, plan: { select: { type: true } } },
  });
}

export type MemberBillingPortalResult = { ok: true; url: string } | { ok: false; error: string };

/** HU-ST-17: "Gestionar mi pago" — Billing Portal de la cuenta conectada del centro. */
export async function openMemberBillingPortal(): Promise<MemberBillingPortalResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };
  return createMemberBillingPortalSession(ctx.session.user.orgId, ctx.member.id);
}

export type MemberCancellationResult = { ok: true; cancelAt: Date } | { ok: false; error: string };

/**
 * "Darme de baja": por defecto, a fin del periodo ya pagado (nunca inmediata
 * desde el portal — la baja inmediata con reembolso prorrateado, HU-ST-15,
 * sigue siendo cosa de recepción). Un socio con un bono puntual (no
 * recurrente) no tiene nada que cancelar: su bono caduca solo.
 */
export async function requestMemberCancellation(): Promise<MemberCancellationResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const subscription = await latestLiveSubscription(ctx.member.id);
  if (!subscription) return { ok: false, error: "No tienes ninguna suscripción activa." };
  if (!isRecurring(subscription.plan.type)) {
    return { ok: false, error: "Tu bono no es una cuota recurrente: caduca solo, no hace falta darlo de baja." };
  }
  if (subscription.cancelAt) return { ok: false, error: "Ya tienes una baja programada." };

  const cancelAt = subscription.endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (subscription.stripeSubscriptionId) {
    const resolved = await stripeForOrg(ctx.session.user.orgId);
    if (resolved.ok) {
      try {
        await resolved.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: true },
          { stripeAccount: resolved.accountId }
        );
      } catch {
        return { ok: false, error: "No se ha podido comunicar la baja a Stripe. Inténtalo de nuevo en un momento." };
      }
    }
  }

  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAt } });
  await prisma.auditLog.create({
    data: {
      orgId: ctx.session.user.orgId,
      actorUserId: ctx.session.user.id,
      action: "MEMBER_SUBSCRIPTION_CANCELLATION_REQUESTED",
      entityType: "Subscription",
      entityId: subscription.id,
      memberId: ctx.member.id,
      metadata: { cancelAt },
    },
  });

  revalidatePath("/portal/membresia");
  return { ok: true, cancelAt };
}

export type MemberActionResult = { ok: true } | { ok: false; error: string };

/** Revertir una baja programada, en cualquier momento antes de la fecha. */
export async function revertMemberCancellation(): Promise<MemberActionResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const subscription = await prisma.subscription.findFirst({
    where: { memberId: ctx.member.id, status: { in: ["ACTIVE", "FROZEN"] }, cancelAt: { not: null } },
    orderBy: { startDate: "desc" },
    select: { id: true, stripeSubscriptionId: true },
  });
  if (!subscription) return { ok: false, error: "No tienes ninguna baja programada." };

  if (subscription.stripeSubscriptionId) {
    const resolved = await stripeForOrg(ctx.session.user.orgId);
    if (resolved.ok) {
      try {
        await resolved.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: false },
          { stripeAccount: resolved.accountId }
        );
      } catch {
        return { ok: false, error: "No se ha podido revertir la baja en Stripe. Inténtalo de nuevo en un momento." };
      }
    }
  }

  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAt: null } });
  await prisma.auditLog.create({
    data: {
      orgId: ctx.session.user.orgId,
      actorUserId: ctx.session.user.id,
      action: "MEMBER_SUBSCRIPTION_CANCELLATION_REVERTED",
      entityType: "Subscription",
      entityId: subscription.id,
      memberId: ctx.member.id,
      metadata: {},
    },
  });

  revalidatePath("/portal/membresia");
  return { ok: true };
}

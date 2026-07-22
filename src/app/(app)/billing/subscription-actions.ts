"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { Prisma } from "@prisma/client";

export type SubscriptionActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_ROLES = ["OWNER", "CENTER_DIRECTOR", "RECEPTION"] as const;

async function logAudit(
  orgId: string,
  actorUserId: string,
  action: string,
  entityId: string,
  memberId: string,
  metadata: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { orgId, actorUserId, action, entityType: "Subscription", entityId, memberId, metadata },
  });
}

function revalidateMemberAndBilling(memberId: string) {
  revalidatePath("/billing");
  revalidatePath(`/members/${memberId}`);
}

/** RB-PAGO-002: aplaza un pago pendiente a una fecha límite futura, con motivo obligatorio. */
export async function postponePayment(formData: FormData): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const paymentId = String(formData.get("paymentId") ?? "");
  const newDueDateRaw = String(formData.get("newDueDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!paymentId || !newDueDateRaw) return { ok: false, error: "Selecciona una fecha límite." };
  if (!reason) return { ok: false, error: "El motivo del aplazamiento es obligatorio." };
  const newDueDate = new Date(newDueDateRaw);
  if (Number.isNaN(newDueDate.getTime()) || newDueDate <= new Date()) {
    return { ok: false, error: "La nueva fecha límite debe ser futura." };
  }

  const payment = await prisma.payment.findFirst({ where: { id: paymentId, orgId: session.user.orgId } });
  if (!payment) return { ok: false, error: "Pago no encontrado." };
  if (payment.status !== "PENDING") return { ok: false, error: "Solo se pueden aplazar pagos pendientes." };

  await prisma.payment.update({ where: { id: paymentId }, data: { dueDate: newDueDate } });
  await logAudit(session.user.orgId, session.user.id, "PAYMENT_POSTPONED", paymentId, payment.memberId, {
    reason,
    previousDueDate: payment.dueDate,
    newDueDate,
  });

  revalidateMemberAndBilling(payment.memberId);
  return { ok: true };
}

/** RB-PAGO-003 (D-2): devolución en modo registro local. Bloquea si el cobro fue vía Stripe (pendiente de PAGO-2b). */
export async function refundPayments(formData: FormData): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const paymentIds = formData.getAll("paymentId").map(String).filter(Boolean);
  const reason = String(formData.get("reason") ?? "").trim();

  if (paymentIds.length === 0) return { ok: false, error: "Selecciona al menos un pago." };
  if (!reason) return { ok: false, error: "El motivo de la devolución es obligatorio." };

  const payments = await prisma.payment.findMany({ where: { id: { in: paymentIds }, orgId: session.user.orgId } });
  if (payments.length !== paymentIds.length) return { ok: false, error: "Alguno de los pagos no se ha encontrado." };
  if (payments.some((p) => p.status !== "PAID")) return { ok: false, error: "Solo se pueden devolver pagos cobrados (PAID)." };
  if (payments.some((p) => p.stripePaymentIntentId)) {
    return {
      ok: false,
      error: "Devolución Stripe no disponible: pendiente de credenciales del cliente — PAGO-2b. No se puede procesar aquí.",
    };
  }

  const refundedAt = new Date();
  await prisma.payment.updateMany({
    where: { id: { in: paymentIds } },
    data: { status: "REFUNDED", refundReason: reason, refundedAt },
  });
  for (const p of payments) {
    await logAudit(session.user.orgId, session.user.id, "PAYMENT_REFUNDED_LOCAL", p.id, p.memberId, { reason, amountCents: p.amountCents });
  }

  const memberId = payments[0]?.memberId;
  if (memberId) revalidateMemberAndBilling(memberId);
  return { ok: true };
}

/** RB-PAGO-004: congela la suscripción (indefinida si pauseUntil es null) y al socio. */
export async function freezeSubscription(formData: FormData): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const pauseUntilRaw = String(formData.get("pauseUntil") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!subscriptionId) return { ok: false, error: "Falta la suscripción." };
  if (!reason) return { ok: false, error: "El motivo de la congelación es obligatorio." };

  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, member: { orgId: session.user.orgId } },
    include: { member: { select: { id: true } } },
  });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };
  if (subscription.status !== "ACTIVE") return { ok: false, error: "Solo se pueden congelar suscripciones activas." };

  const pauseUntil = pauseUntilRaw ? new Date(pauseUntilRaw) : null;
  if (pauseUntilRaw && (Number.isNaN(pauseUntil!.getTime()) || pauseUntil! <= new Date())) {
    return { ok: false, error: "La fecha de reanudación debe ser futura." };
  }

  await prisma.$transaction([
    prisma.subscription.update({ where: { id: subscriptionId }, data: { status: "FROZEN", pauseUntil } }),
    prisma.member.update({ where: { id: subscription.memberId }, data: { state: "FROZEN" } }),
  ]);
  await logAudit(session.user.orgId, session.user.id, "SUBSCRIPTION_FROZEN", subscriptionId, subscription.memberId, { reason, pauseUntil });

  revalidateMemberAndBilling(subscription.memberId);
  return { ok: true };
}

/** RB-PAGO-004: reanuda una suscripción congelada. */
export async function resumeSubscription(subscriptionId: string, memberId: string): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const subscription = await prisma.subscription.findFirst({ where: { id: subscriptionId, member: { orgId: session.user.orgId } } });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };
  if (subscription.status !== "FROZEN") return { ok: false, error: "Esta suscripción no está congelada." };

  await prisma.$transaction([
    prisma.subscription.update({ where: { id: subscriptionId }, data: { status: "ACTIVE", pauseUntil: null } }),
    prisma.member.update({ where: { id: subscription.memberId }, data: { state: "ACTIVE" } }),
  ]);
  await logAudit(session.user.orgId, session.user.id, "SUBSCRIPTION_RESUMED", subscriptionId, subscription.memberId, {});

  revalidateMemberAndBilling(memberId);
  return { ok: true };
}

/** RB-PAGO-005: producto/venta puntual, atribuida al vendedor (RB-RRHH-004). */
export async function addOneOffProduct(formData: FormData): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const memberId = String(formData.get("memberId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const priceEuros = Number(formData.get("priceCents") ?? 0);

  if (!memberId || !description) return { ok: false, error: "Indica una descripción del producto/servicio." };
  if (!priceEuros || priceEuros <= 0) return { ok: false, error: "Introduce un importe válido." };

  const member = await prisma.member.findFirst({ where: { id: memberId, orgId: session.user.orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const count = await prisma.payment.count({ where: { orgId: session.user.orgId } });
  const payment = await prisma.payment.create({
    data: {
      orgId: session.user.orgId,
      memberId,
      amountCents: Math.round(priceEuros * 100),
      method: "CASH",
      status: "PAID",
      date: new Date(),
      receiptNumber: `TZ-${2000 + count}`,
      notes: `Venta puntual: ${description}`,
      soldByUserId: session.user.id,
    },
  });
  await logAudit(session.user.orgId, session.user.id, "ONE_OFF_PRODUCT_SOLD", payment.id, memberId, { description, amountCents: payment.amountCents });

  revalidateMemberAndBilling(memberId);
  return { ok: true };
}

/** RB-PAGO-006: programa la cancelación de una suscripción a una fecha futura (la ejecuta el job de F10). */
export async function scheduleCancellation(formData: FormData): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const cancelAtRaw = String(formData.get("cancelAt") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!subscriptionId || !cancelAtRaw) return { ok: false, error: "Indica la fecha de cancelación." };
  if (!reason) return { ok: false, error: "El motivo de la cancelación es obligatorio." };

  const cancelAt = new Date(cancelAtRaw);
  if (Number.isNaN(cancelAt.getTime()) || cancelAt <= new Date()) return { ok: false, error: "La fecha de cancelación debe ser futura." };

  const subscription = await prisma.subscription.findFirst({ where: { id: subscriptionId, member: { orgId: session.user.orgId } } });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };
  if (subscription.status !== "ACTIVE" && subscription.status !== "FROZEN") {
    return { ok: false, error: "Solo se pueden programar cancelaciones de suscripciones activas o congeladas." };
  }

  await prisma.subscription.update({ where: { id: subscriptionId }, data: { cancelAt } });
  await logAudit(session.user.orgId, session.user.id, "SUBSCRIPTION_CANCELLATION_SCHEDULED", subscriptionId, subscription.memberId, { reason, cancelAt });

  revalidateMemberAndBilling(subscription.memberId);
  return { ok: true };
}

/** RB-PAGO-006: cancela una cancelación programada (vuelve a "sin fecha de baja"). */
export async function cancelScheduledCancellation(subscriptionId: string, memberId: string): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const subscription = await prisma.subscription.findFirst({ where: { id: subscriptionId, member: { orgId: session.user.orgId } } });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };
  if (!subscription.cancelAt) return { ok: false, error: "Esta suscripción no tiene una cancelación programada." };

  await prisma.subscription.update({ where: { id: subscriptionId }, data: { cancelAt: null } });
  await logAudit(session.user.orgId, session.user.id, "SUBSCRIPTION_CANCELLATION_UNSCHEDULED", subscriptionId, subscription.memberId, {});

  revalidateMemberAndBilling(memberId);
  return { ok: true };
}

/** RB-PAGO-007: cambia el precio con efecto desde el próximo ciclo (no retroactivo). */
export async function updateSubscriptionPrice(formData: FormData): Promise<SubscriptionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const newPriceEuros = Number(formData.get("newPriceCents") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!subscriptionId || !newPriceEuros || newPriceEuros <= 0) return { ok: false, error: "Introduce un precio válido." };
  if (!reason) return { ok: false, error: "El motivo del cambio de precio es obligatorio." };

  const subscription = await prisma.subscription.findFirst({ where: { id: subscriptionId, member: { orgId: session.user.orgId } } });
  if (!subscription) return { ok: false, error: "Suscripción no encontrada." };

  const newPriceCents = Math.round(newPriceEuros * 100);
  await prisma.subscription.update({ where: { id: subscriptionId }, data: { priceCents: newPriceCents } });
  await logAudit(session.user.orgId, session.user.id, "SUBSCRIPTION_PRICE_UPDATED", subscriptionId, subscription.memberId, {
    reason,
    previousPriceCents: subscription.priceCents,
    newPriceCents,
  });

  revalidateMemberAndBilling(subscription.memberId);
  return { ok: true };
}

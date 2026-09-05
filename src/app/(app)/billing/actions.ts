"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, memberIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import type { PaymentMethod } from "@prisma/client";
import { confirmLeadClosureForMember } from "@/lib/leads-queries";
import { createCheckoutSession, type CheckoutResult } from "@/lib/stripe-checkout";
import { createPaymentWithReceipt } from "@/lib/payments";

export type PaymentActionResult = { ok: true } | { ok: false; error: string };

// RB-PAGO-001/RB-LEAD-005: Stripe es el canal objetivo; el registro manual se
// mantiene como puente (documentado en el plan de implementación) mientras no
// todo cobro pasa por Stripe. Ambos caminos anotan quién vendió (RB-RRHH-004)
// y confirman el cierre de lead si aplica (RB-LEAD-005/007).
export async function registerManualPayment(formData: FormData): Promise<PaymentActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);

  const memberId = String(formData.get("memberId") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "") || null;
  const amountEuros = Number(formData.get("amount") ?? 0);
  const method = String(formData.get("method") ?? "CASH") as PaymentMethod;

  if (!memberId) return { ok: false, error: "Selecciona un socio e introduce un importe." };
  // `!amountEuros` solo descarta 0/NaN/"": un importe negativo colaba como un
  // "cobro" que en realidad resta dinero, sin pasar por el flujo dedicado de
  // devolución (motivo obligatorio + doble confirmación).
  if (!Number.isFinite(amountEuros) || amountEuros <= 0) return { ok: false, error: "Introduce un importe válido." };

  // El socio (y la suscripción, si se indica) tienen que ser de esta
  // organización y estar en el ámbito de centro de quien cobra: `memberId` y
  // `subscriptionId` llegan del `FormData` del cliente, manipulable.
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId: session.user.orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!(await memberIsInScope(session.user, memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  if (subscriptionId) {
    // `member` ya está verificado dentro de `orgId`, así que acotar por
    // `memberId` basta para que la suscripción también lo esté.
    const subscription = await prisma.subscription.findFirst({ where: { id: subscriptionId, memberId } });
    if (!subscription) return { ok: false, error: "Esa suscripción no pertenece a este socio." };
  }

  await createPaymentWithReceipt({
    orgId: session.user.orgId,
    memberId,
    subscriptionId,
    amountCents: Math.round(amountEuros * 100),
    method,
    status: "PAID",
    date: new Date(),
    notes: "Registrado manualmente en mostrador",
    soldByUserId: session.user.id,
  });

  await confirmLeadClosureForMember(session.user.orgId, memberId);

  revalidatePath("/billing");
  revalidatePath("/leads");
  return { ok: true };
}

export async function createStripeCheckoutAction(formData: FormData): Promise<CheckoutResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  const memberId = String(formData.get("memberId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  if (!memberId || !planId) return { ok: false, error: "Selecciona un socio y un plan." };
  return createCheckoutSession(session.user.orgId, memberId, planId, session.user.id);
}

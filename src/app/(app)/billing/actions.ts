"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { PaymentMethod } from "@prisma/client";
import { confirmLeadClosureForMember } from "@/lib/leads-queries";
import { createCheckoutSession, type CheckoutResult } from "@/lib/stripe-checkout";

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

  if (!memberId || !amountEuros) return { ok: false, error: "Selecciona un socio e introduce un importe." };

  const count = await prisma.payment.count({ where: { orgId: session.user.orgId } });

  await prisma.payment.create({
    data: {
      orgId: session.user.orgId,
      memberId,
      subscriptionId,
      amountCents: Math.round(amountEuros * 100),
      method,
      status: "PAID",
      date: new Date(),
      receiptNumber: `TZ-${2000 + count}`,
      notes: "Registrado manualmente en mostrador",
      soldByUserId: session.user.id,
    },
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

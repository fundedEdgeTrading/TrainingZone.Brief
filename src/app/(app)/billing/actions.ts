"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import type { PaymentMethod } from "@prisma/client";

export type PaymentActionResult = { ok: true } | { ok: false; error: string };

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
    },
  });

  revalidatePath("/billing");
  return { ok: true };
}

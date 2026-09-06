import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createMemberCheckout, isRecurring } from "@/lib/member-billing";
import { requireMember } from "../_lib/require-member";
import { apiOk, apiError } from "../_lib/response";

const bodySchema = z.object({ planId: z.string().trim().min(1) });

/**
 * A3 del handoff (confirmar y pagar el bono del primer login).
 *
 * El cobro con tarjeta vive en Stripe Checkout sobre la cuenta conectada del
 * gimnasio y se abre SIEMPRE en el navegador externo del dispositivo (nunca en
 * un WebView incrustado: Stripe no lo soporta). Si el gimnasio todavía no ha
 * conectado Stripe, se responde `mode: "manual"` y la app explica que el centro
 * activará el bono al confirmar el pago — no se crea ninguna suscripción sin
 * cobro.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("planId es obligatorio.", 400);

  const plan = await prisma.membershipPlan.findFirst({
    where: { id: parsed.data.planId, orgId: claims.orgId, active: true },
    select: { id: true, name: true, priceCents: true, type: true },
  });
  if (!plan) return apiError("Ese producto ya no está disponible.", 404);

  const result = await createMemberCheckout({
    orgId: claims.orgId,
    memberId: member.id,
    planId: plan.id,
    centerId: member.primaryCenterId,
    origin: "portal",
  });

  // E5-12: la app calculaba "hoy + 1 mes" ella misma para CUALQUIER producto,
  // incluidos los bonos puntuales que no tienen "siguiente cobro". El cálculo
  // se hace aquí, una vez, con la misma regla que decide si el plan es
  // recurrente (`isRecurring`).
  const recurring = isRecurring(plan.type);
  const nextChargeAt = recurring ? nextMonthFrom(new Date()).toISOString() : null;

  if (!result.ok) {
    return apiOk({ mode: "manual" as const, planName: plan.name, priceCents: plan.priceCents, reason: result.error });
  }
  return apiOk({
    mode: "stripe" as const,
    url: result.url,
    planName: plan.name,
    priceCents: plan.priceCents,
    isRecurring: recurring,
    nextChargeAt,
  });
}

function nextMonthFrom(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

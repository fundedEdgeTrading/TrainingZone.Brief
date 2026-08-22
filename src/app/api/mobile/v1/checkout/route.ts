import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createMemberCheckout } from "@/lib/member-billing";
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
    select: { id: true, name: true, priceCents: true },
  });
  if (!plan) return apiError("Ese producto ya no está disponible.", 404);

  const result = await createMemberCheckout({
    orgId: claims.orgId,
    memberId: member.id,
    planId: plan.id,
    centerId: member.primaryCenterId,
    origin: "portal",
  });

  if (!result.ok) {
    return apiOk({ mode: "manual" as const, planName: plan.name, priceCents: plan.priceCents, reason: result.error });
  }
  return apiOk({ mode: "stripe" as const, url: result.url, planName: plan.name, priceCents: plan.priceCents });
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { createMemberCheckout } from "@/lib/member-billing";
import { requireMember } from "../../../_lib/require-member";
import { apiOk, apiError } from "../../../_lib/response";

const bodySchema = z.object({ planId: z.string().trim().min(1) });

/**
 * F6 (autoservicio móvil): checkout de compra/recarga de bono. La app abre
 * `url` en el navegador externo del dispositivo — Stripe Checkout no funciona
 * embebido en un WebView — nunca en una pantalla propia de la app.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("planId es obligatorio.", 400);

  const result = await createMemberCheckout({
    orgId: auth.claims.orgId,
    memberId: auth.member.id,
    planId: parsed.data.planId,
    centerId: auth.member.primaryCenterId,
    origin: "portal",
  });
  if (!result.ok) return apiError(result.error, 400);

  return apiOk({ url: result.url });
}

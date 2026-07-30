import type { NextRequest } from "next/server";
import { createMemberBillingPortalSession } from "@/lib/member-billing";
import { requireMember } from "../../../_lib/require-member";
import { apiOk, apiError } from "../../../_lib/response";

/**
 * F6 (autoservicio móvil): sesión del Billing Portal de Stripe del socio. La
 * app abre `url` en el navegador externo del dispositivo, nunca en un WebView
 * incrustado.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const result = await createMemberBillingPortalSession(auth.claims.orgId, auth.member.id);
  if (!result.ok) return apiError(result.error, 400);

  return apiOk({ url: result.url });
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { bookSessionForMember } from "@/lib/portal-queries";
import { resolveTimezone } from "@/lib/timezone";
import { requireMember } from "../../../_lib/require-member";
import { apiOk, apiError } from "../../../_lib/response";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  // Día concreto de la serie ("YYYY-MM-DD"); si falta, se reserva la ocurrencia base.
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("sessionId es obligatorio.", 400);

  const timezone = await resolveTimezone(auth.member.primaryCenter.timezone);
  const result = await bookSessionForMember(auth.member, parsed.data.sessionId, timezone, parsed.data.occurrenceDate);
  if (!result.ok) return apiError(result.error, result.needsTopUp ? 409 : 400);

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
  revalidateSessionViews();

  return apiOk({ waitlisted: result.waitlisted });
}

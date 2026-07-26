import type { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { bookSessionForMember } from "@/lib/portal-queries";
import { requireMember } from "../../../_lib/require-member";
import { apiOk, apiError } from "../../../_lib/response";

const bodySchema = z.object({ sessionId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("sessionId es obligatorio.", 400);

  const result = await bookSessionForMember(auth.member, parsed.data.sessionId);
  if (!result.ok) return apiError(result.error, result.needsTopUp ? 409 : 400);

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
  revalidateSessionViews();

  return apiOk({ waitlisted: result.waitlisted });
}

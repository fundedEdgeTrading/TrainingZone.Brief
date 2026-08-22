import { getPendingBirthdayGreeting, dismissBirthdayGreeting } from "@/lib/birthday-jobs";
import { resolveTimezone } from "@/lib/timezone";
import { requireMember } from "../../_lib/require-member";
import { apiOk, apiError } from "../../_lib/response";

/** Espejo móvil de `/api/portal/greeting` (F5 §6.3): misma lógica, misma regla. */
export async function GET(req: Request) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const timezone = await resolveTimezone(auth.member.primaryCenter.timezone);
  const greeting = await getPendingBirthdayGreeting(auth.claims.orgId, auth.claims.sub, auth.member.id, timezone);
  return apiOk({ greeting });
}

export async function POST(req: Request) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return apiError("Falta el identificador.", 400);

  const result = await dismissBirthdayGreeting(auth.claims.orgId, auth.claims.sub, body.id);
  if (!result.ok) return apiError("No se ha encontrado esa felicitación.", 404);
  return apiOk({ dismissed: true });
}

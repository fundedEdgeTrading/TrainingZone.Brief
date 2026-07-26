import type { NextResponse } from "next/server";
import { requireApiRole } from "./api-session";
import { getMemberForUser } from "@/lib/portal-queries";
import { apiError } from "./response";
import type { ApiTokenClaims } from "@/lib/mobile-auth";

type MemberRecord = NonNullable<Awaited<ReturnType<typeof getMemberForUser>>>;

export type RequireMemberResult =
  | { ok: true; claims: ApiTokenClaims; member: MemberRecord }
  | { ok: false; response: NextResponse };

// Endpoints del portal del socio (F0 §4.6): solo rol MEMBER, y siempre sobre
// su propia ficha (nunca un memberId recibido del cliente).
export async function requireMember(req: Request): Promise<RequireMemberResult> {
  const auth = await requireApiRole(req, ["MEMBER"]);
  if (!auth.ok) return auth;

  const member = await getMemberForUser(auth.claims.sub);
  if (!member) return { ok: false, response: apiError("No se ha encontrado tu ficha de socio.", 404) };

  return { ok: true, claims: auth.claims, member };
}

import type { NextRequest } from "next/server";
import { getMemberCalendar } from "../../_lib/calendar";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

// B5 del handoff: calendario del socio (realizadas, reservadas y no presentadas)
// del mes pedido. Siempre sobre su propia ficha (requireMember), nunca un
// memberId recibido del cliente.
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;

  const calendar = await getMemberCalendar(auth.member.id, req.nextUrl.searchParams.get("month"));
  return apiOk(calendar);
}

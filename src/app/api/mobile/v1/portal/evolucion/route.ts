import type { NextRequest } from "next/server";
import { getMemberEvolution } from "@/lib/portal-queries";
import { requireMember } from "../../_lib/require-member";
import { apiOk, apiError } from "../../_lib/response";

// Espejo de src/app/(app)/portal/evolucion/page.tsx ("Mi evolución").
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const evolution = await getMemberEvolution(member.id, claims.orgId);
  if (!evolution) return apiError("No se ha encontrado tu evolución.", 404);

  return apiOk(evolution);
}

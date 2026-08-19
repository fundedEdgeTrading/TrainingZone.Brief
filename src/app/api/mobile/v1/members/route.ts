import type { NextRequest } from "next/server";
import type { MemberState, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listMembers } from "@/lib/members-queries";
import { canManageMembers } from "@/lib/rbac";
import { requireApiRole } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

// D2 del handoff: listado de socios con buscador y chips de estado (espejo de
// src/app/(app)/members/page.tsx, que hasta ahora solo existía en web).
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "RECEPTION", "PLATFORM_ADMIN"];
const STATES: MemberState[] = ["PROSPECT", "TRIAL", "ACTIVE", "DELINQUENT", "FROZEN", "CANCELLED"];

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageMembers(claims.role)) return apiError("No tienes permiso para ver los socios.", 403);

  const params = req.nextUrl.searchParams;
  const stateParam = params.get("state");
  const state = stateParam && STATES.includes(stateParam as MemberState) ? (stateParam as MemberState) : undefined;

  const [members, byState] = await Promise.all([
    listMembers(claims.orgId, { q: params.get("search")?.trim() || undefined, state }),
    prisma.member.groupBy({ by: ["state"], where: { orgId: claims.orgId }, _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(byState.map((row) => [row.state, row._count._all])) as Partial<Record<MemberState, number>>;

  return apiOk({
    counts: {
      all: byState.reduce((sum, row) => sum + row._count._all, 0),
      active: counts.ACTIVE ?? 0,
      delinquent: counts.DELINQUENT ?? 0,
      frozen: counts.FROZEN ?? 0,
      trial: counts.TRIAL ?? 0,
      cancelled: counts.CANCELLED ?? 0,
    },
    members: members.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      email: m.email,
      state: m.state,
      centerName: m.primaryCenter.name,
      planName: m.subscriptions[0]?.plan.name ?? null,
      photoUrl: m.photoUrl,
    })),
  });
}

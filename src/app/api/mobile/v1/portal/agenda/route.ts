import type { NextRequest } from "next/server";
import { getBookableSessions, getPendingSessionFeedback } from "@/lib/portal-queries";
import { getMemberServiceKinds, getSessionBalances } from "@/lib/members-queries";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

// Espejo de src/app/(app)/portal/agenda/page.tsx ("Reservar clase").
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
  const balances = getSessionBalances(
    member.subscriptions.map((s) => ({ status: s.status, sessionsRemaining: s.sessionsRemaining, plan: { type: s.plan.type } }))
  );

  const [sessions, pendingFeedback] = await Promise.all([
    getBookableSessions(claims.orgId, member.primaryCenterId, member.id, {
      trainerId: member.trainerId,
      hasGroupService: serviceKinds.includes("GROUP"),
      hasEpService: serviceKinds.includes("EP"),
    }),
    getPendingSessionFeedback(member.id),
  ]);

  return apiOk({ sessions, balances, pendingFeedback });
}

import type { NextRequest } from "next/server";
import { getMemberProgress, getMemberMonthlyActivity, getMemberHealthTransparency } from "@/lib/portal-queries";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

// Espejo de src/app/(app)/portal/page.tsx ("Mi actividad").
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const [progress, monthlyActivity, healthTransparency] = await Promise.all([
    getMemberProgress(member.id),
    getMemberMonthlyActivity(member.id),
    getMemberHealthTransparency(member.id, claims.orgId),
  ]);

  const activeSubscription = member.subscriptions[0];

  return apiOk({
    member: { id: member.id, firstName: member.firstName, lastName: member.lastName },
    progress,
    monthlyActivity,
    healthTransparency,
    plan: activeSubscription
      ? { planName: activeSubscription.plan.name, startDate: activeSubscription.startDate }
      : null,
  });
}

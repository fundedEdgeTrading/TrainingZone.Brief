import type { NextRequest } from "next/server";
import { getBookableSessions, getPendingSessionFeedback, getMemberUpcomingBookings } from "@/lib/portal-queries";
import { getSessionBalances, activeBookingSubscriptions } from "@/lib/members-queries";
import { resolveTimezone } from "@/lib/timezone";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

// Espejo de src/app/(app)/portal/agenda/page.tsx ("Reservar clase").
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { claims, member } = auth;

  const balances = getSessionBalances(
    member.subscriptions.map((s) => ({
      status: s.status,
      sessionsRemaining: s.sessionsRemaining,
      plan: { type: s.plan.type, sessionsIncluded: s.plan.sessionsIncluded },
    }))
  );

  // La app nativa no manda cookie de zona: la referencia es la del centro del
  // socio, que es donde se dan las clases. `startsAt` viaja como instante real,
  // así que el móvil lo puede formatear en la zona del dispositivo sin desfase.
  const timezone = await resolveTimezone(member.primaryCenter.timezone);

  const [sessions, pendingFeedback, upcomingBookings] = await Promise.all([
    getBookableSessions(claims.orgId, member.id, activeBookingSubscriptions(member.subscriptions), timezone),
    getPendingSessionFeedback(member.id, timezone),
    getMemberUpcomingBookings(member.id, timezone),
  ]);

  return apiOk({
    sessions,
    balances,
    pendingFeedback,
    upcomingBookings,
  });
}

import type { NextRequest } from "next/server";
import { getSessionBrief } from "@/lib/brief-queries";
import { parseDateParam, formatDateParam } from "@/lib/date-utils";
import { occursOn } from "@/lib/session-occurrences";
import { requireApiRole } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

const LIGHT_ORDER: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

// Espejo de src/app/(app)/brief/[id]/page.tsx (detalle de Session Brief).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const brief = await getSessionBrief({
    orgId: claims.orgId,
    sessionId: id,
    actorUserId: claims.sub,
    actorRole: claims.role,
  });
  if (!brief) return apiError("No se ha encontrado esa sesión.", 404);

  const { session: cls, roster, canSeeHealth } = brief;

  const dParam = req.nextUrl.searchParams.get("d");
  const occurrenceDate = dParam && occursOn(cls, parseDateParam(dParam)) ? parseDateParam(dParam) : cls.date;

  const sorted = [...roster].sort(
    (a, b) => (a.light ? LIGHT_ORDER[a.light] : 3) - (b.light ? LIGHT_ORDER[b.light] : 3)
  );

  return apiOk({
    session: {
      id: cls.id,
      name: cls.name,
      startTime: cls.startTime,
      centerName: cls.center.name,
      trainerName: cls.trainer?.name ?? null,
      occurrenceDate: formatDateParam(occurrenceDate),
    },
    canSeeHealth,
    roster: sorted.map((r) => ({
      bookingId: r.bookingId,
      member: r.member,
      isNew: r.isNew,
      conditions: r.conditions,
      matchedRules: r.matchedRules,
      light: r.light,
      debrief: r.debrief ? { feeling: r.debrief.feeling } : null,
    })),
  });
}

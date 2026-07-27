import type { NextRequest } from "next/server";
import { getKpis, getMemberStateBreakdown, getOccupancyByCenter, getNoShowRate } from "@/lib/dashboard-queries";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// Espejo trimmed de src/app/(app)/dashboard/page.tsx ("Panel de control"), con
// el subconjunto de KPIs más relevante para una consulta rápida desde el móvil.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const [kpis, memberStateBreakdown, occupancyByCenter, noShowRatePct] = await Promise.all([
    getKpis(claims.orgId),
    getMemberStateBreakdown(claims.orgId),
    getOccupancyByCenter(claims.orgId),
    getNoShowRate(claims.orgId),
  ]);

  return apiOk({ kpis, memberStateBreakdown, occupancyByCenter, noShowRatePct });
}

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainerRatingSummary } from "@/lib/trainer-rating-access";
import {
  getKpiTiles,
  getRevenueSeries,
  getNetJoins,
  getNoShowRate,
  getDelinquencyAmount,
} from "@/lib/dashboard-queries";
import { centerScopeFor } from "@/lib/center-scope";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// D1 del handoff: panel de control de dirección. KPIs pedidos por el cliente —
// socios activos, ingresos del mes, morosidad, altas/bajas, asistencia media y
// ranking de entrenadores — con chips para mirar la organización entera o un
// centro concreto.
//
// E12-05: este endpoint dejó de llevar su propia aritmética (`_lib/dashboard.ts`,
// retirado). Sirve los mismos `getKpiTiles`/`getRevenueSeries` que la web, así
// que morosos, la comparativa de ingresos y el ámbito de centro dan el mismo
// número en las dos superficies — antes no: morosos salía de `Payment` sin
// ventana temporal en vez de `Member.state`, la comparativa de ingresos
// enfrentaba un mes parcial contra uno entero, y el ámbito se resolvía con
// `claims.centerId` en vez de `centerScopeFor` (una dirección imputada a dos
// centros veía uno en la app y dos en la web). "Asistencia" sigue siendo OTRA
// métrica que "ocupación": no se han fusionado, solo se han corregido.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  // Mismo ámbito de centro que la web (center-scope.ts), no `claims.centerId`
  // a pelo: `null` = toda la organización (dirección de organización/soporte).
  const scope = await centerScopeFor({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });

  const centers = await prisma.center.findMany({
    where: { orgId: claims.orgId, ...(scope !== null ? { id: { in: scope } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const requested = req.nextUrl.searchParams.get("centerId");
  const requestedAllowed = requested && centers.some((c) => c.id === requested) ? requested : null;
  // Con un único centro en su ámbito, ese es el centro; con varios (o ámbito
  // sin frontera), gana lo que pida el selector, y si no pide nada válido, la
  // organización entera (o todo su ámbito).
  const centerId = requestedAllowed ?? (centers.length === 1 ? centers[0].id : null);
  const canChooseCenter = scope === null || centers.length > 1;

  const dashOpts = { centerId, range: "mes" as const };

  const [tiles, revenueSeries, netJoins, noShow, delinquencyAmountCents, ratings] = await Promise.all([
    getKpiTiles(claims.orgId, dashOpts),
    getRevenueSeries(claims.orgId, dashOpts),
    getNetJoins(claims.orgId, dashOpts),
    getNoShowRate(claims.orgId, dashOpts),
    getDelinquencyAmount(claims.orgId, dashOpts),
    // Ranking de entrenadores: solo dirección puede leer valoraciones
    // (trainer-rating-access.ts devuelve null al resto).
    getTrainerRatingSummary(claims.orgId, claims.role),
  ]);

  const revenueTile = tiles.find((t) => t.key === "revenue")!;
  const activeTile = tiles.find((t) => t.key === "activeMembers")!;
  const delinquentTile = tiles.find((t) => t.key === "delinquent")!;

  const trainerImages = ratings?.length
    ? await prisma.user.findMany({
        where: { id: { in: ratings.map((r) => r.trainerUserId) } },
        select: { id: true, image: true },
      })
    : [];
  const imageById = new Map(trainerImages.map((t) => [t.id, t.image]));

  return apiOk({
    centers,
    centerId,
    canChooseCenter,
    revenue: {
      monthCents: revenueTile.numericValue,
      deltaPct: revenueTile.deltaValue,
      series: revenueSeries.rows.map((r) => ({ label: r.label, cents: Math.round(r.totalEuros * 100) })),
    },
    members: {
      active: activeTile.numericValue,
      newThisMonth: netJoins.joins,
      churnedThisMonth: netJoins.cancels,
    },
    delinquency: {
      members: delinquentTile.numericValue,
      amountCents: delinquencyAmountCents,
    },
    attendance: {
      avgPct: noShow.held ? Math.round((noShow.attended / noShow.held) * 100) : 0,
      noShowPct: noShow.rate,
      sessionsHeld: noShow.held,
    },
    ranking:
      ratings
        ?.filter((r) => r.avgScore != null)
        .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
        .slice(0, 6)
        .map((r) => ({
          trainerUserId: r.trainerUserId,
          name: r.name,
          image: imageById.get(r.trainerUserId) ?? null,
          avgScore: Math.round((r.avgScore ?? 0) * 10) / 10,
          count: r.count,
        })) ?? null,
  });
}

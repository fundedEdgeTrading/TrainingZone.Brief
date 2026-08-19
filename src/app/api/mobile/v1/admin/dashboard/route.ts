import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainerRatingSummary } from "@/lib/trainer-rating-access";
import { getMobileDashboard } from "../../_lib/dashboard";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// D1 del handoff: panel de control de dirección. KPIs pedidos por el cliente —
// socios activos, ingresos del mes, morosidad, altas/bajas, asistencia media y
// ranking de entrenadores — con chips para mirar la organización entera o un
// centro concreto.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const centers = await prisma.center.findMany({
    where: { orgId: claims.orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // La dirección de centro solo ve el suyo; dirección de organización elige.
  const requested = req.nextUrl.searchParams.get("centerId");
  const scoped = claims.role === "CENTER_DIRECTOR" ? claims.centerId : requested;
  const centerId = scoped && centers.some((c) => c.id === scoped) ? scoped : null;

  const [dashboard, ratings] = await Promise.all([
    getMobileDashboard(claims.orgId, centerId),
    // Ranking de entrenadores: solo dirección puede leer valoraciones
    // (trainer-rating-access.ts devuelve null al resto).
    getTrainerRatingSummary(claims.orgId, claims.role),
  ]);

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
    canChooseCenter: claims.role !== "CENTER_DIRECTOR",
    ...dashboard,
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

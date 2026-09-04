import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { listTrainerMembers, type TrainerMemberFilter } from "@/lib/trainer-members-queries";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// Pestaña «Socios» del entrenador (rediseño de la app móvil). NO es el listado
// de gestión de `/members`, que exige `canManageMembers` y enseña estado
// comercial: aquí el ámbito es la gente a la que este entrenador da sesión, y
// lo que se enseña es adherencia y aptitud. Por eso el conjunto de roles es
// otro y el filtro por entrenador va dentro de la consulta, no en el cliente.
const TRAINER_ROLES: Role[] = ["TRAINER", "TRAINER_ADMIN", "OWNER", "CENTER_DIRECTOR"];

const FILTERS: TrainerMemberFilter[] = ["all", "ep", "group", "alerts"];

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, TRAINER_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const params = req.nextUrl.searchParams;
  const filterParam = params.get("filter");
  const filter = FILTERS.includes(filterParam as TrainerMemberFilter) ? (filterParam as TrainerMemberFilter) : "all";

  // Sin filtro para poder contar los ejes (los chips llevan contador) y filtrar
  // después en memoria: son decenas de socios, no miles.
  const all = await listTrainerMembers(claims.orgId, { userId: claims.sub, role: claims.role }, {
    search: params.get("search") ?? undefined,
  });

  const alerts = all.filter((m) => m.light === "AMBER" || m.light === "RED");
  const members =
    filter === "ep"
      ? all.filter((m) => m.kinds.includes("EP"))
      : filter === "group"
        ? all.filter((m) => m.kinds.includes("GROUP"))
        : filter === "alerts"
          ? alerts
          : all;

  return apiOk({
    counts: {
      all: all.length,
      ep: all.filter((m) => m.kinds.includes("EP")).length,
      group: all.filter((m) => m.kinds.includes("GROUP")).length,
      alerts: alerts.length,
    },
    // El bloque "Requieren adaptación" va siempre completo, sea cual sea el
    // chip elegido: es lo que no se puede perder de vista.
    needAdaptation: alerts,
    members,
  });
}

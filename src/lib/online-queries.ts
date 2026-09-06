import { prisma } from "@/lib/prisma";

// D.2 — Biblioteca de entrenamientos online (plan ONLINE): vídeos pregrabados
// disponibles sin límite de sesiones.
export async function getOnlineWorkouts(orgId: string) {
  return prisma.onlineWorkout.findMany({
    where: { orgId, active: true },
    orderBy: { publishedAt: "desc" },
  });
}

/**
 * E12-03: un plan ONLINE sin contenido que entregar no es un plan vendible de
 * verdad. `saveMembershipPlan` lo consulta para decidir si un plan ONLINE
 * puede activarse.
 */
export async function hasOnlineContent(orgId: string): Promise<boolean> {
  const count = await prisma.onlineWorkout.count({ where: { orgId, active: true } });
  return count > 0;
}

import { prisma } from "@/lib/prisma";

// D.2 — Biblioteca de entrenamientos online (plan ONLINE): vídeos pregrabados
// disponibles sin límite de sesiones.
export async function getOnlineWorkouts(orgId: string) {
  return prisma.onlineWorkout.findMany({
    where: { orgId, active: true },
    orderBy: { publishedAt: "desc" },
  });
}

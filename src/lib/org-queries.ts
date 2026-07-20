import { prisma } from "@/lib/prisma";

export async function getCentersWithCounts(orgId: string) {
  return prisma.center.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { members: true, staffMemberships: true } },
    },
  });
}

/**
 * Personal de la organización (todo lo que no es socio) con su imputación a
 * centros. `role`/`centerId` son el rol y centro base del usuario;
 * `centerMemberships` es la imputación efectiva (uno o varios centros).
 */
export async function getStaffWithMemberships(orgId: string) {
  return prisma.user.findMany({
    where: { orgId, role: { not: "MEMBER" } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      centerId: true,
      centerMemberships: {
        include: { center: { select: { id: true, name: true } } },
        orderBy: { isPrimary: "desc" },
      },
    },
  });
}

import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export async function getOrganization(orgId: string) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      stripeAccount: { select: { chargesEnabled: true, payoutsEnabled: true } },
    },
  });
}

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
      invitation: { select: { usedAt: true, expiresAt: true } },
    },
  });
}

/** Listado ligero de personal asignable (dueño de lead, entrenador responsable...). */
export async function listAssignableStaff(orgId: string, roles?: Role[], centerId?: string | null) {
  return prisma.user.findMany({
    where: {
      orgId,
      role: roles ? { in: roles } : { not: "MEMBER" },
      // Acotado al centro cuando quien pregunta trabaja sobre un centro
      // concreto (la agenda). Sin esto, el filtro de entrenadores de La Jota
      // listaba también a los de Santander y el desplegable de "Nueva sesión"
      // dejaba asignar una clase a alguien que no pisa ese centro.
      ...(centerId
        ? { OR: [{ centerId }, { centerMemberships: { some: { centerId } } }] }
        : {}),
    },
    orderBy: { name: "asc" },
    // `image`: los chips de entrenador de la agenda móvil llevan su foto.
    select: { id: true, name: true, role: true, image: true },
  });
}

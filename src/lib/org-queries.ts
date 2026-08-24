import { prisma } from "@/lib/prisma";
import type { Prisma, Role } from "@prisma/client";

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
 *
 * Por defecto solo la plantilla viva: quien está de baja (`deactivatedAt`) ya
 * no es del equipo. `includeInactive` lo pide la pantalla de plantilla, que sí
 * enseña las bajas —marcadas y con la opción de reincorporar—; `scope` acota el
 * listado a los centros de quien pregunta (ver lib/staff-queries.ts).
 */
export async function getStaffWithMemberships(
  orgId: string,
  options: { includeInactive?: boolean; scope?: Prisma.UserWhereInput } = {}
) {
  return prisma.user.findMany({
    where: {
      orgId,
      role: { not: "MEMBER" },
      ...(options.includeInactive ? {} : { deactivatedAt: null }),
      // El ámbito va bajo `AND`, no esparcido: trae su propio `role` (excluye
      // los de organización) y al fusionarlo pisaba al de aquí, así que a
      // dirección de centro se le colaban los socios en la plantilla.
      ...(options.scope ? { AND: [options.scope] } : {}),
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      centerId: true,
      visibleInApp: true,
      deactivatedAt: true,
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
      // Nadie asigna trabajo a quien ya no está en plantilla (RB-RRHH-014):
      // este selector alimenta la agenda, la ficha de sesión y el dueño de un
      // lead, y una baja seguía apareciendo en los tres.
      deactivatedAt: null,
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

import { prisma } from "@/lib/prisma";
import { isStripeConfiguredForOrg } from "@/lib/stripe";

/** Catálogo de planes activos de la organización — compartido entre la landing pública (`/hazte-socio`) y el autoservicio autenticado (`/portal/membresia`, F6). */
export async function getActiveMembershipPlans(orgId: string) {
  return prisma.membershipPlan.findMany({
    where: { orgId, active: true },
    orderBy: [{ priceCents: "asc" }],
    select: { id: true, name: true, type: true, priceCents: true, sessionsIncluded: true, validityDays: true },
  });
}

/** Contexto público (sin sesión) para la landing de alta de socios (`/hazte-socio`). */
export async function getPublicMembershipContext(orgSlug: string, centerSlug: string) {
  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!organization) return null;

  const center = await prisma.center.findFirst({
    where: { orgId: organization.id, slug: centerSlug },
    select: { id: true, name: true },
  });
  if (!center) return null;

  const [plans, stripeReady] = await Promise.all([
    getActiveMembershipPlans(organization.id),
    // RB-VENTA-004: gating de UI — si el gimnasio no puede cobrar hoy, la
    // página degrada el CTA con una explicación en vez de un botón muerto.
    isStripeConfiguredForOrg(organization.id),
  ]);

  return { organization, center, plans, stripeReady };
}

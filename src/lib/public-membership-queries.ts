import { prisma } from "@/lib/prisma";
import { isStripeConfiguredForOrg } from "@/lib/stripe";

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
    prisma.membershipPlan.findMany({
      where: { orgId: organization.id, active: true },
      orderBy: [{ priceCents: "asc" }],
      select: { id: true, name: true, type: true, priceCents: true, sessionsIncluded: true, validityDays: true },
    }),
    // RB-VENTA-004: gating de UI — si el gimnasio no puede cobrar hoy, la
    // página degrada el CTA con una explicación en vez de un botón muerto.
    isStripeConfiguredForOrg(organization.id),
  ]);

  return { organization, center, plans, stripeReady };
}

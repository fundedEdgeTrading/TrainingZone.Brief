import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { isStripeConfiguredForOrg } from "@/lib/stripe";

/**
 * Ficha pública del centro (E9-04, E9-05).
 *
 * El select era `{ id, name }` cuando el esquema ya tenía `address`, `lat`,
 * `lng` y `timezone`, y el modelo ha ganado además el NAP completo. Sin esto la
 * página no puede decir dónde está el centro, y una página que no dice dónde
 * está no la casa Google con ninguna intención local.
 *
 * `description` es el campo que decide si esto posiciona: sin párrafo propio por
 * centro, la plantilla compartida sigue siendo contenido duplicado aunque el
 * título cambie.
 */
export const PUBLIC_CENTER_SELECT = {
  id: true,
  name: true,
  slug: true,
  address: true,
  lat: true,
  lng: true,
  timezone: true,
  phone: true,
  city: true,
  postalCode: true,
  neighborhood: true,
  description: true,
  openingHours: true,
  publicPage: true,
} as const;

/** Catálogo de planes activos de la organización — compartido entre la landing pública (`/hazte-socio`) y el autoservicio autenticado (`/portal/membresia`, F6). */
export async function getActiveMembershipPlans(orgId: string) {
  return prisma.membershipPlan.findMany({
    where: { orgId, active: true },
    orderBy: [{ priceCents: "asc" }],
    select: { id: true, name: true, type: true, priceCents: true, sessionsIncluded: true, validityDays: true },
  });
}

/**
 * Contexto público (sin sesión) para la landing de alta de socios (`/hazte-socio`).
 *
 * Va envuelto en `cache()` porque desde E9-04 se llama DOS veces por petición:
 * una en `generateMetadata` y otra en el render. Sin esto, cada página de centro
 * duplicaría sus tres consultas y la comprobación de Stripe.
 */
export const getPublicMembershipContext = cache(async function getPublicMembershipContext(
  orgSlug: string,
  centerSlug: string
) {
  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });
  if (!organization) return null;

  const center = await prisma.center.findFirst({
    where: { orgId: organization.id, slug: centerSlug },
    select: PUBLIC_CENTER_SELECT,
  });
  if (!center) return null;

  const [plans, stripeReady] = await Promise.all([
    getActiveMembershipPlans(organization.id),
    // RB-VENTA-004: gating de UI — si el gimnasio no puede cobrar hoy, la
    // página degrada el CTA con una explicación en vez de un botón muerto.
    isStripeConfiguredForOrg(organization.id),
  ]);

  return { organization, center, plans, stripeReady };
});

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { isStripeConfiguredForOrg } from "@/lib/stripe";
import { centerPublicTag, orgCatalogTag } from "@/lib/public-center-seo";

/**
 * Diez minutos (E9-14). Es el techo de lo rancio que puede estar una ficha si
 * nadie invalida su etiqueta: suficientemente corto para que un error de
 * teléfono no viva un día, y suficientemente largo para que el rastreo de Google
 * no se traduzca en una consulta por visita.
 */
export const PUBLIC_CENTER_REVALIDATE = 600;

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

/**
 * E9-14 · La misma ficha, servida de caché.
 *
 * La página de centro hacía dos consultas secuenciales más el catálogo más la
 * comprobación de Stripe **en cada visita**, sin `revalidate` y sin
 * `generateStaticParams`. Para una página que cambia cuando el gimnasio edita su
 * ficha —es decir, casi nunca— eso es pagar cuatro viajes a la base de datos por
 * cada persona que entra desde Google.
 *
 * Se cachea aquí y no en la página porque **quien no debe cachear es el
 * checkout**: `getPublicMembershipContext` sigue siendo la vía fresca, y la usan
 * el route handler de pago y las acciones de servidor. Cobrar un precio de hace
 * diez minutos no es una optimización, es un error de facturación.
 *
 * Dos etiquetas: la del centro (la ficha) y la del catálogo de su organización
 * (las tarifas). Cambiar una tarifa afecta a todos sus centros a la vez.
 */
export function getCachedPublicMembershipContext(orgSlug: string, centerSlug: string) {
  return unstable_cache(
    () => getPublicMembershipContext(orgSlug, centerSlug),
    ["public-membership-context", orgSlug, centerSlug],
    { revalidate: PUBLIC_CENTER_REVALIDATE, tags: [centerPublicTag(orgSlug, centerSlug), orgCatalogTag(orgSlug)] }
  )();
}

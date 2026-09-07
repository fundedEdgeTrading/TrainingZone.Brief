import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { PUBLIC_CENTER_SELECT, PUBLIC_CENTER_REVALIDATE } from "@/lib/public-membership-queries";
import { centerPublicTag } from "@/lib/public-center-seo";

/**
 * Contexto público (sin sesión) para el formulario de leads embebido por centro.
 *
 * Mismo select de centro que `/hazte-socio` (E9-05): las dos plantillas son la
 * misma ficha del mismo centro, y tenerlas con dos selects distintos es
 * exactamente cómo se desincronizan. `cache()` por lo mismo que allí: desde
 * E9-04 el contexto se pide una vez en `generateMetadata` y otra en el render.
 */
export const getPublicLeadFormContext = cache(async function getPublicLeadFormContext(
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

  const channels = await prisma.leadChannel.findMany({
    where: { orgId: organization.id, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });

  return { organization, center, channels };
});

/**
 * E9-14 · La versión cacheada, para la página. La acción de servidor que crea el
 * lead sigue usando la fresca: un canal de captación recién desactivado no puede
 * seguir aceptando leads durante diez minutos.
 */
export function getCachedPublicLeadFormContext(orgSlug: string, centerSlug: string) {
  return unstable_cache(
    () => getPublicLeadFormContext(orgSlug, centerSlug),
    ["public-lead-context", orgSlug, centerSlug],
    { revalidate: PUBLIC_CENTER_REVALIDATE, tags: [centerPublicTag(orgSlug, centerSlug)] }
  )();
}

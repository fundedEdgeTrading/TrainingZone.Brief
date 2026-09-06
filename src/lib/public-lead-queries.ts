import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { PUBLIC_CENTER_SELECT } from "@/lib/public-membership-queries";

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

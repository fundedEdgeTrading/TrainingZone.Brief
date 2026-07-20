import { prisma } from "@/lib/prisma";

/** Contexto público (sin sesión) para el formulario de leads embebido por centro. */
export async function getPublicLeadFormContext(orgSlug: string, centerSlug: string) {
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

  const channels = await prisma.leadChannel.findMany({
    where: { orgId: organization.id, active: true },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });

  return { organization, center, channels };
}

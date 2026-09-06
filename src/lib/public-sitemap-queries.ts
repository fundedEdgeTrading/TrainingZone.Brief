import { prisma } from "@/lib/prisma";
import { OPERATIONAL_PLATFORM_STATUSES } from "@/lib/entitlements";

/** Un centro publicable, con lo justo para construir su URL y su fecha. */
export type SitemapCenter = {
  orgSlug: string;
  centerSlug: string;
  updatedAt: Date;
};

/**
 * E9-06 · Los centros que pueden entrar en el sitemap.
 *
 * Dos filtros, y ninguno es opcional:
 *
 *  · `platformStatus` operativo — enseñarle a Google gimnasios que no han
 *    pagado, o organizaciones de prueba de un comercial, es publicar el estado
 *    comercial de Apta en la SERP.
 *  · `publicPage = true` — el interruptor de E9-05. Por defecto está apagado:
 *    publicar los datos de un centro es una decisión suya.
 *
 * Y uno implícito: sin dirección ni descripción la ficha es la plantilla vacía
 * repetida, así que tampoco entra. La comprobación coincide con la que impone
 * `updateCenterPublicProfile` al marcar «publicar», pero se repite aquí porque
 * un dato puede haberse vaciado después por otra vía.
 */
export async function listSitemapCenters(): Promise<SitemapCenter[]> {
  const centers = await prisma.center.findMany({
    where: {
      publicPage: true,
      address: { not: null },
      description: { not: null },
      organization: { platformStatus: { in: [...OPERATIONAL_PLATFORM_STATUSES] } },
    },
    select: {
      slug: true,
      createdAt: true,
      organization: { select: { slug: true, platformStatusSince: true } },
    },
    orderBy: { name: "asc" },
  });

  return centers.map((c) => ({
    orgSlug: c.organization.slug,
    centerSlug: c.slug,
    // `Center` no guarda `updatedAt`, así que el `lastModified` honesto es la
    // fecha más reciente que sí se conoce. Mentir aquí con `new Date()` sería
    // decirle a Google que la página cambia cada vez que rastrea, y es la
    // manera más rápida de que deje de creerse el sitemap entero.
    updatedAt: maxDate(c.createdAt, c.organization.platformStatusSince),
  }));
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

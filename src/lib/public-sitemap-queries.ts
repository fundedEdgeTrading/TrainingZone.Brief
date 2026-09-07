import { prisma } from "@/lib/prisma";
import { OPERATIONAL_PLATFORM_STATUSES } from "@/lib/entitlements";
import { citySlug } from "@/lib/landing-pages";

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

/** Un centro tal y como lo pinta el índice público. */
export type DirectoryCenter = {
  orgSlug: string;
  centerSlug: string;
  name: string;
  city: string;
  citySlug: string;
  neighborhood: string | null;
  address: string | null;
  description: string | null;
};

export type DirectoryCity = {
  slug: string;
  label: string;
  centers: DirectoryCenter[];
};

/**
 * E9-11 · El índice de centros, agrupado por ciudad.
 *
 * Es la mitad humana de lo que el sitemap resuelve para el rastreador: **no
 * existía ningún índice interno que enlazara a las páginas de centro**, así que
 * un visitante solo llegaba a una si el gimnasio publicaba la URL en su propia
 * web. Una página que solo se alcanza escribiendo su dirección exacta no es una
 * página pública, es un enlace privado.
 *
 * Mismos filtros que el sitemap —organización operativa, `publicPage`, y ficha
 * con dirección y descripción— más uno propio: sin `city` no hay ciudad bajo la
 * que colocarlo, y meterlo en un cajón de "otros" sería inventar una categoría.
 *
 * El orden y el rótulo se deciden AQUÍ y no en el `ORDER BY`: la ordenación de
 * Postgres depende de la intercalación de la base de datos, y `C.UTF-8` pone
 * "Zaragoza" antes que "zaragoza" mientras que `en_US.UTF-8` hace lo contrario.
 * Con el rótulo saliendo del primer centro de la lista, eso significaba un
 * `<h1>` y un `<title>` que decían "Centros de entrenamiento en zaragoza"
 * según dónde estuviera desplegada la base — el mismo despliegue, distinto
 * texto indexado.
 */
export async function listDirectoryCities(): Promise<DirectoryCity[]> {
  const centers = await prisma.center.findMany({
    where: {
      publicPage: true,
      address: { not: null },
      description: { not: null },
      city: { not: null },
      organization: { platformStatus: { in: [...OPERATIONAL_PLATFORM_STATUSES] } },
    },
    select: {
      name: true,
      slug: true,
      city: true,
      neighborhood: true,
      address: true,
      description: true,
      organization: { select: { slug: true } },
    },
  });

  const byCity = new Map<string, { slug: string; labels: string[]; centers: DirectoryCenter[] }>();
  for (const center of centers) {
    const city = center.city as string;
    const slug = citySlug(city);
    // Dos centros que escriben "Zaragoza" y "zaragoza" son la misma ciudad: se
    // agrupan por slug, y las dos grafías se guardan para elegir rótulo después.
    const bucket = byCity.get(slug) ?? { slug, labels: [], centers: [] };
    bucket.labels.push(city);
    bucket.centers.push({
      orgSlug: center.organization.slug,
      centerSlug: center.slug,
      name: center.name,
      city,
      citySlug: slug,
      neighborhood: center.neighborhood,
      address: center.address,
      description: center.description,
    });
    byCity.set(slug, bucket);
  }

  return [...byCity.values()]
    .map((bucket) => ({
      slug: bucket.slug,
      label: cityLabel(bucket.labels),
      centers: bucket.centers.sort((a, b) => byName(a.name, b.name)),
    }))
    .sort((a, b) => byName(a.label, b.label));
}

/** Un orden estable e igual en cualquier base: el de un lector español. */
function byName(a: string, b: string): number {
  return a.localeCompare(b, "es") || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * De todas las grafías con que se ha escrito una ciudad, la que se enseña.
 *
 * Un topónimo es un nombre propio, así que gana la que empieza por mayúscula;
 * entre iguales, la primera alfabéticamente. No se recapitaliza a mano: "A
 * Coruña" o "L'Hospitalet de Llobregat" no sobreviven a un `toUpperCase` del
 * primer carácter, y reescribir el nombre de la ciudad de alguien es peor que
 * respetar cómo lo escribió.
 */
function cityLabel(labels: string[]): string {
  return [...labels].sort((a, b) => properNounFirst(a) - properNounFirst(b) || byName(a, b))[0];
}

function properNounFirst(label: string): number {
  const first = label.trim().charAt(0);
  return first && first === first.toLocaleUpperCase("es") && first !== first.toLocaleLowerCase("es") ? 0 : 1;
}

export async function directoryCity(slug: string): Promise<DirectoryCity | null> {
  const cities = await listDirectoryCities();
  return cities.find((c) => c.slug === slug) ?? null;
}

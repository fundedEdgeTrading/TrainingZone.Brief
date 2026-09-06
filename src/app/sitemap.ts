import type { MetadataRoute } from "next";

import { publicOrigin } from "@/lib/site";
import { INDEXABLE_PATHS } from "@/lib/seo";
import { membershipPath } from "@/lib/public-center-seo";
import { listDirectoryCities, listSitemapCenters } from "@/lib/public-sitemap-queries";
import { FEATURE_PAGES, VERTICAL_PAGES, featurePath, verticalPath } from "@/lib/landing-pages";

/**
 * E9-06 · `/sitemap.xml`.
 *
 * Ninguna página pública tenía `generateStaticParams` y no había un solo índice
 * interno que enlazara a los centros: **si el gimnasio no publicaba la URL en su
 * propia web, Google no llegaba jamás.** Este fichero es la mitad de la
 * respuesta; la otra mitad es `/centros` (E9-11), que resuelve además la
 * orfandad para un visitante humano.
 *
 * Lo que NO entra, y por qué:
 *  · `/lead-form` — canoniza hacia `/hazte-socio` (E9-04). Un sitemap que
 *    propone una URL canonizada hacia otra es una contradicción que Google
 *    resuelve ignorando el sitemap.
 *  · Nada con token, `/portal` ni `/dashboard` — se deriva de `INDEXABLE_PATHS`,
 *    así que no hay forma de colar una a mano.
 *
 * Se sirve dinámico: el juego de centros publicados cambia sin desplegar.
 */
export const dynamic = "force-dynamic";

/** Prioridades relativas. La portada comercial manda; las fichas de centro son el largo. */
const PRIORITY: Record<string, number> = {
  "/planes": 1,
  "/centros": 0.8,
  "/funcionalidades": 0.8,
  "/privacidad": 0.3,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = INDEXABLE_PATHS
    // Dos de estos prefijos no son páginas, son la raíz bajo la que cuelgan
    // otras: `/hazte-socio` y `/para`. Sus hijas se enumeran una a una.
    .filter((path) => path !== "/hazte-socio" && path !== "/para")
    .map((path) => ({
      url: `${origin}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: PRIORITY[path] ?? 0.5,
    }));

  // E9-11 · Las páginas de captación. Son estáticas y se conocen en tiempo de
  // compilación, así que su fecha es la del despliegue.
  const landingEntries: MetadataRoute.Sitemap = [
    ...FEATURE_PAGES.map((page) => featurePath(page.slug)),
    ...VERTICAL_PAGES.map((page) => verticalPath(page.slug)),
  ].map((path) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const [centers, cities] = await Promise.all([listSitemapCenters(), listDirectoryCities()]);

  const cityEntries: MetadataRoute.Sitemap = cities.map((city) => ({
    url: `${origin}/centros/${city.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const centerEntries: MetadataRoute.Sitemap = centers.map((center) => ({
    url: `${origin}${membershipPath(center.orgSlug, center.centerSlug)}`,
    lastModified: center.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...landingEntries, ...cityEntries, ...centerEntries];
}

import type { MetadataRoute } from "next";

import { publicOrigin } from "@/lib/site";
import { robotsRules } from "@/lib/seo";

/**
 * E9-02 · `/robots.txt`.
 *
 * Las reglas salen de `@/lib/seo`, derivadas a su vez de `PUBLIC_PATHS`: la
 * lista de lo que se sirve sin sesión y la de lo que se indexa no pueden vivir
 * en dos sitios que se desincronicen.
 *
 * Depende de E9-01: hasta que el matcher del proxy dejó de rebotar `.txt`, esta
 * ruta respondía 307 a `/login` y Googlebot la leía como "no disponible".
 */
export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: robotsRules(),
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

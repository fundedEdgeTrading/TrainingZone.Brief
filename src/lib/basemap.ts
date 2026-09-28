// Teselas del callejero de fondo (CARTO) para los mapas de Leaflet. Módulo puro:
// sin DOM ni Leaflet, así que lo pueden importar el mapa de barrios, la tarjeta
// del panel y la ficha pública, y probarse sin navegador.

/**
 * Clave de CARTO Basemaps (https://carto.com/basemaps/apikey/).
 *
 * Desde septiembre de 2026 CARTO sirve las teselas raster SIN clave con una
 * marca de agua repetida «API KEY REQUIRED»: no bloquea nada, pero el mapa se ve
 * roto. La clave es gratuita (uso comercial hasta 1 M de teselas al mes) y va en
 * la URL de cada tesela, así que es PÚBLICA por naturaleza: viaja al navegador
 * igual que la de cualquier mapa web. No es un secreto y no se trata como tal.
 *
 * Al ser `NEXT_PUBLIC_`, Next la incrusta en el bundle al CONSTRUIR: tiene que
 * estar definida en el build, no solo al arrancar. Sin ella todo funciona
 * igual, con la marca de agua.
 *
 * Se lee con la referencia literal `process.env.NEXT_PUBLIC_…` a propósito: es
 * la única forma que Next sustituye en el cliente.
 */
function basemapKey(): string {
  return (process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY ?? "").trim();
}

/** Los estilos de CARTO que usan los mapas de la app. */
export type CartoStyle = "light_all" | "light_nolabels" | "light_only_labels";

/**
 * Plantilla de URL de teselas de CARTO para `L.tileLayer`, con la clave si está
 * configurada. Es el ÚNICO sitio que construye estas URLs: un mapa nuevo que
 * escribiera la suya a mano volvería a salir con marca de agua (lo vigila
 * `basemap.test.ts`).
 */
export function cartoTileUrl(style: CartoStyle): string {
  const base = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  const key = basemapKey();
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}

/** Atribución que exigen CARTO y OpenStreetMap en cualquier mapa que use sus teselas. */
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

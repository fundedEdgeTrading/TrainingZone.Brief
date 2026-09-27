// Marcador de centro compartido por los tres mapas de Leaflet. Solo cliente:
// importa `leaflet`, que toca `window` al cargarse.

import L from "leaflet";

/**
 * Marcador de un centro: chincheta en tinta con el punto hueso y el nombre en
 * una pastilla oscura al lado.
 *
 * Antes era un cuadradito de 13 px con el nombre en mayúsculas y halo claro —
 * el mismo tratamiento que un rótulo de barrio—, así que el centro se perdía
 * entre ellos. Va sin logotipo a propósito: el mapa es de cada organización
 * (Apta es multi-marca) y el isotipo de Training Zone no es el de todas.
 *
 * Lo comparten el mapa de barrios, el mapa del panel y la ficha pública
 * (`center-mini-map.tsx`), que lo pinta sin nombre: allí el nombre ya está en
 * la página. Los estilos, `.tz-pin*` en `globals.css`.
 */
export function centerPinIcon(name?: string): L.DivIcon {
  return L.divIcon({
    className: "tz-pin",
    html: `<span class="tz-pin-mark" aria-hidden="true"><span class="tz-pin-dot"></span></span>${
      name ? `<span class="tz-pin-name">${escapeHtml(name)}</span>` : ""
    }`,
    iconSize: [26, 34],
    iconAnchor: [13, 33],
  });
}

/** Los nombres de centro entran en `innerHTML` del `divIcon`. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

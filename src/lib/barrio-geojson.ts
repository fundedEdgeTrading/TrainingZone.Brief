/**
 * Geometría real de barrio en TopoJSON (E11-08).
 *
 * Es la mejora que más precisión aporta por menos código, porque **la vista ya
 * trabaja sobre anillos**: color, etiquetas, foco y encuadre no distinguen si el
 * anillo viene de `tessellate()` o de un contorno oficial. Lo único que cambia es
 * de dónde sale.
 *
 * Efecto colateral que importa tanto como la precisión: elimina de golpe el
 * acantilado de rendimiento de `tessellate()`, que es O(n²) y **síncrono en el
 * hilo principal** (1.200 barrios → 150 ms; 2.500 → 603 ms). Con geometría
 * publicada esos milisegundos no existen.
 *
 * Por qué TopoJSON y no GeoJSON: los barrios comparten fronteras, y TopoJSON
 * guarda cada frontera UNA vez en vez de dos. Con `quantization` encima, una
 * ciudad entera cabe en el presupuesto (80 KB gz) que un GeoJSON crudo se gasta
 * en tres barrios.
 *
 * Módulo puro: no toca red ni DOM. La descarga la hace el mapa, contra
 * `/api/geo/[ciudad]`.
 */

import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import type { Ring } from "@/lib/barrio-geometry";

/** Presupuesto por ciudad, comprimido. Por encima, el mapa tarda más en pintar de lo que gana en precisión. */
export const CITY_GEOMETRY_BUDGET_GZ = 80 * 1024;

/**
 * Propiedades que cada barrio del TopoJSON tiene que traer.
 *
 * `code` es el código postal, que es la clave por la que la vista cruza
 * geometría y datos. Un contorno sin `code` no se puede colorear con nada, así
 * que no se acepta "por si acaso": se descarta y la ciudad se queda con la
 * teselación, que al menos es una aproximación declarada.
 */
export type BarrioFeatureProps = { code: string; name?: string };

/** Nombre del objeto del TopoJSON que contiene los barrios. */
export const BARRIOS_OBJECT = "barrios";

export type BarrioRings = {
  /** CP → anillo, en el formato `[lat, lng]` que consume `L.polygon`. */
  byCode: Record<string, Ring>;
  /** Cuántos contornos se han descartado por venir sin `code` o sin polígono. */
  skipped: number;
};

/**
 * TopoJSON → anillos por código postal.
 *
 * Se queda con el anillo EXTERIOR de cada barrio y descarta los huecos. Un
 * barrio con un hueco dentro (un parque, un recinto militar) se pintaría igual
 * de bien con el hueco, pero `L.polygon` con multipolígonos y agujeros complica
 * el resto de la vista —etiquetas, encuadre, foco— a cambio de una diferencia
 * que a escala de ciudad no se ve. Es una simplificación consciente, no un
 * descuido.
 */
export function ringsFromTopology(topology: Topology): BarrioRings {
  const object = topology.objects?.[BARRIOS_OBJECT];
  if (!object) return { byCode: {}, skipped: 0 };

  // El objeto de barrios es siempre un `GeometryCollection`, así que `feature()`
  // devuelve una `FeatureCollection`. Se comprueba en tiempo de ejecución en vez
  // de darlo por hecho: el fichero lo genera un script contra datos de un
  // ayuntamiento, y ahí caben sorpresas.
  const collection = feature(topology, object as GeometryCollection<BarrioFeatureProps>);
  const features = collection.type === "FeatureCollection" ? collection.features : [];

  const byCode: Record<string, Ring> = {};
  let skipped = 0;

  for (const item of features) {
    const code = (item.properties as BarrioFeatureProps | null)?.code;
    const ring = outerRing(item.geometry);
    if (!code || !ring) {
      skipped++;
      continue;
    }
    byCode[code] = ring;
  }

  return { byCode, skipped };
}

/**
 * El anillo exterior, ya volteado a `[lat, lng]`.
 *
 * GeoJSON guarda `[lng, lat]` y Leaflet espera `[lat, lng]`: es la confusión que
 * deja los mapas en el golfo de Guinea, y por eso la conversión vive en un solo
 * sitio.
 */
function outerRing(geometry: GeoJSON.Geometry | null): Ring | null {
  if (!geometry) return null;

  if (geometry.type === "Polygon") return toLatLng(geometry.coordinates[0]);
  if (geometry.type === "MultiPolygon") {
    // Un barrio partido en varios trozos (una isla, un enclave): se queda con el
    // mayor, que es el que la etiqueta tiene que rotular.
    const largest = geometry.coordinates
      .map((polygon) => polygon[0])
      .sort((a, b) => b.length - a.length)[0];
    return largest ? toLatLng(largest) : null;
  }
  return null;
}

function toLatLng(coordinates: GeoJSON.Position[]): Ring | null {
  if (!coordinates || coordinates.length < 3) return null;
  return coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
}

/**
 * `true` si la geometría descargada sirve para pintar ESTA ciudad.
 *
 * No basta con que el fichero exista: si trae la mitad de los barrios que el
 * mapa necesita, media ciudad quedaría sin polígono y la otra media con contorno
 * real — un mapa a dos criterios es peor que uno aproximado entero. En ese caso
 * se cae a la teselación completa.
 */
export function coversCity(rings: BarrioRings, codes: string[]): boolean {
  if (codes.length === 0) return false;
  return codes.every((code) => rings.byCode[code] !== undefined);
}

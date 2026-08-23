// Geometría de barrio para el mapa de coropletas (/mapa-barrios).
//
// `PostalCodeArea` solo guarda un punto (lat/lng) por código postal, no el
// contorno del barrio. Hasta que entre el GeoJSON oficial del cliente, el
// polígono de cada barrio se aproxima teselando la ciudad: cada punto se queda
// con la porción de mapa que le cae más cerca que a cualquier otro (Voronoi),
// recortada al casco convexo de la ciudad para que la mancha no se derrame al
// infinito. Es una aproximación y la vista lo dice en su propia leyenda.
//
// Cuando llegue la geometría real basta con servir un anillo por `code` en vez
// de llamar a `tessellate()`: el resto de la vista (color, etiquetas, foco,
// encuadre) trabaja sobre anillos, no sobre puntos.

export type GeoPoint = { lat: number; lng: number };

/** Anillo cerrado en pares [lat, lng] — el formato que consume `L.polygon`. */
export type Ring = [number, number][];

const EARTH_RADIUS_KM = 6371;

/** Distancia en km entre dos coordenadas (fórmula del semiverseno). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Centro más cercano de una lista, con su distancia en km (null si la lista está vacía). */
export function nearestOf<T extends GeoPoint & { name: string }>(
  point: GeoPoint,
  candidates: T[]
): { center: T; km: number } | null {
  let best: { center: T; km: number } | null = null;
  for (const candidate of candidates) {
    const km = haversineKm(point, candidate);
    if (!best || km < best.km) best = { center: candidate, km };
  }
  return best;
}

// --- Teselación: Voronoi por recorte sucesivo de semiplanos ------------------
//
// A escala de ciudad la Tierra es plana: basta con corregir la longitud por el
// coseno de la latitud media para que las distancias en x e y sean comparables
// y las mediatrices caigan donde deben.

type Flat = { x: number; y: number };

function project(p: GeoPoint, lat0: number): Flat {
  return { x: p.lng * Math.cos((lat0 * Math.PI) / 180), y: p.lat };
}

function unproject(q: Flat, lat0: number): [number, number] {
  return [q.y, q.x / Math.cos((lat0 * Math.PI) / 180)];
}

/** Casco convexo (monotone chain), en sentido antihorario. */
function convexHull(points: Flat[]): Flat[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Flat, a: Flat, b: Flat) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Flat[] = [];
  for (const q of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Flat[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const q = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Recorta `poly` al semiplano de los puntos más cercanos a `a` que a `b`. */
function clipHalfPlane(poly: Flat[], a: Flat, b: Flat): Flat[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const side = (p: Flat) => (p.x - mx) * dx + (p.y - my) * dy;

  const out: Flat[] = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % poly.length];
    const fp = side(P);
    const fq = side(Q);
    if (fp <= 0) out.push(P);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push({ x: P.x + t * (Q.x - P.x), y: P.y + t * (Q.y - P.y) });
    }
  }
  return out;
}

/** Marco de recorte cuando el casco convexo no existe (1-2 barrios, o colineales). */
function boundingClip(sites: Flat[]): Flat[] {
  const xs = sites.map((s) => s.x);
  const ys = sites.map((s) => s.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Con un único barrio el span es 0: el margen mínimo (≈1 km) evita devolver
  // un polígono degenerado que Leaflet dibujaría como un punto.
  const padX = Math.max((maxX - minX) * 0.3, 0.01);
  const padY = Math.max((maxY - minY) * 0.3, 0.01);
  return [
    { x: minX - padX, y: minY - padY },
    { x: maxX + padX, y: minY - padY },
    { x: maxX + padX, y: maxY + padY },
    { x: minX - padX, y: maxY + padY },
  ];
}

/** Cuánto se infla el casco convexo para que los barrios del borde no queden cortados a ras. */
const HULL_INFLATE = 1.26;

/**
 * Un polígono por punto, en el mismo orden que la entrada. La unión de todos
 * cubre la ciudad y ninguno se solapa con otro: es lo que permite leer el mapa
 * como una coropleta (barrio a barrio) en vez de como una mancha difuminada.
 */
export function tessellate(points: GeoPoint[]): Ring[] {
  if (points.length === 0) return [];

  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const sites = points.map((p) => project(p, lat0));

  const hull = convexHull(sites);
  let clip: Flat[];
  if (hull.length >= 3) {
    const cx = hull.reduce((sum, q) => sum + q.x, 0) / hull.length;
    const cy = hull.reduce((sum, q) => sum + q.y, 0) / hull.length;
    clip = hull.map((q) => ({ x: cx + (q.x - cx) * HULL_INFLATE, y: cy + (q.y - cy) * HULL_INFLATE }));
  } else {
    clip = boundingClip(sites);
  }

  return sites.map((site, i) => {
    let poly = clip;
    for (let j = 0; j < sites.length; j++) {
      if (j === i) continue;
      poly = clipHalfPlane(poly, site, sites[j]);
      if (poly.length === 0) break;
    }
    return poly.map((q) => unproject(q, lat0));
  });
}

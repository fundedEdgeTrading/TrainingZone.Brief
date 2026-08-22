// BI-3 (RB-LEAD-010 upgrade): CP completo (5 dígitos) → barrio/zona, por ciudad.
// El mapa de calor agrupa por CP completo (barrio) y no por los 2 primeros
// dígitos (provincia): a escala de ciudad la provincia no aporta nada.
//
// ⚠️ Aproximación, no fuente oficial: Correos no publica una tabla 1:1
// CP↔barrio (un mismo CP suele repartir calles entre varios barrios
// colindantes), así que esta correspondencia es un "mejor esfuerzo"
// construido cruzando varias fuentes públicas de código postal — suficiente
// para poblar un mapa de calor de demo/preproducción, pero a revisar con una
// fuente oficial (Ayuntamiento / Correos) antes de usarse como dato definitivo
// de cara a producción real. Coordenadas aproximadas del centro de cada barrio
// (no centroides geocodificados con precisión).
//
// Estos objetos ya NO se leen en tiempo de ejecución para el mapa — son la
// fuente que prisma/seed.ts usa para poblar la tabla `PostalCodeArea` (ver
// schema.prisma), contra la que getPostalCodeStats (dashboard-queries.ts) hace
// el join real. Se mantienen aquí porque es más cómodo de editar como objeto
// TS que como fila de seed suelta.
//
// Para dar de alta otra ciudad: añadir su objeto `<CIUDAD>_POSTAL_CODES` y
// registrarlo en `POSTAL_CODES_BY_CITY`. Todo lo demás (seed, ficha del socio,
// mapa) se deriva de ahí.

export type PostalArea = { name: string; lat: number; lng: number };

export const ZARAGOZA_POSTAL_CODES: Record<string, PostalArea> = {
  "50001": { name: "Casco Histórico", lat: 41.6561, lng: -0.8773 },
  "50002": { name: "La Magdalena", lat: 41.6524, lng: -0.8757 },
  "50003": { name: "San Pablo", lat: 41.658, lng: -0.887 },
  "50004": { name: "La Almozara", lat: 41.66, lng: -0.901 },
  "50005": { name: "Delicias", lat: 41.649, lng: -0.909 },
  "50006": { name: "Universidad", lat: 41.633, lng: -0.898 },
  "50007": { name: "San José", lat: 41.647, lng: -0.858 },
  "50008": { name: "Torrero - La Paz", lat: 41.625, lng: -0.879 },
  "50009": { name: "Casablanca", lat: 41.618, lng: -0.908 },
  "50010": { name: "Parque Roma", lat: 41.642, lng: -0.913 },
  "50011": { name: "Oliver", lat: 41.648, lng: -0.933 },
  "50012": { name: "Valdefierro", lat: 41.639, lng: -0.935 },
  "50013": { name: "Las Fuentes", lat: 41.652, lng: -0.856 },
  "50014": { name: "Venecia", lat: 41.627, lng: -0.87 },
  "50015": { name: "Actur - Rey Fernando", lat: 41.668, lng: -0.885 },
  "50016": { name: "Santa Isabel", lat: 41.675, lng: -0.835 },
  "50017": { name: "Delicias (Miralbueno)", lat: 41.643, lng: -0.923 },
  "50018": { name: "Actur Norte", lat: 41.675, lng: -0.883 },
  "50019": { name: "Valdespartera", lat: 41.6, lng: -0.928 },
};

export const SANTANDER_POSTAL_CODES: Record<string, PostalArea> = {
  "39001": { name: "Centro", lat: 43.4623, lng: -3.8099 },
  "39002": { name: "Centro - Numancia", lat: 43.4641, lng: -3.8153 },
  "39003": { name: "Puertochico", lat: 43.4649, lng: -3.7986 },
  "39004": { name: "Cuatro Caminos", lat: 43.4665, lng: -3.8188 },
  "39005": { name: "El Sardinero", lat: 43.4742, lng: -3.7809 },
  "39006": { name: "General Dávila", lat: 43.4597, lng: -3.8247 },
  "39007": { name: "Castilla - Hermida", lat: 43.4566, lng: -3.8226 },
  "39008": { name: "Cazoña", lat: 43.4652, lng: -3.8381 },
  "39009": { name: "Nueva Montaña", lat: 43.4432, lng: -3.8572 },
  "39010": { name: "Barrio Pesquero - Castilla", lat: 43.4519, lng: -3.8291 },
  "39011": { name: "Peñacastillo", lat: 43.4462, lng: -3.8479 },
  "39012": { name: "Monte - Cueto - San Román", lat: 43.4779, lng: -3.7902 },
};

/** Ciudades cubiertas con detalle de barrio. La clave es el nombre de la ciudad. */
export const POSTAL_CODES_BY_CITY: Record<string, Record<string, PostalArea>> = {
  Zaragoza: ZARAGOZA_POSTAL_CODES,
  Santander: SANTANDER_POSTAL_CODES,
};

/** Tabla plana CP→barrio de todas las ciudades cubiertas (la que siembra `PostalCodeArea`). */
export const POSTAL_CODES: Record<string, PostalArea> = Object.assign(
  {},
  ...Object.values(POSTAL_CODES_BY_CITY),
) as Record<string, PostalArea>;

// Degradación digna: un CP sin barrio en la tabla se agrupa por los dos primeros
// dígitos (provincia) en vez de quedarse en un "Fuera de <ciudad>" que deja de
// ser cierto en cuanto la organización tiene centros en más de una ciudad.
const PROVINCE_BY_PREFIX: Record<string, string> = {
  "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería", "05": "Ávila",
  "06": "Badajoz", "07": "Baleares", "08": "Barcelona", "09": "Burgos", "10": "Cáceres",
  "11": "Cádiz", "12": "Castellón", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña",
  "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
  "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
  "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia",
  "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia", "35": "Las Palmas",
  "36": "Pontevedra", "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria",
  "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel",
  "45": "Toledo", "46": "Valencia", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora",
  "50": "Zaragoza", "51": "Ceuta", "52": "Melilla",
};

/** Ciudad a la que pertenece un CP cubierto por la tabla; si no lo está, su provincia. */
export function postalCityLabel(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  for (const [city, codes] of Object.entries(POSTAL_CODES_BY_CITY)) {
    if (codes[postalCode]) return city;
  }
  return PROVINCE_BY_PREFIX[postalCode.slice(0, 2)] ?? null;
}

/**
 * Etiqueta geográfica de un CP: barrio si está en la tabla, provincia si no, y
 * `null` si no hay CP. Nunca devuelve "Fuera de <ciudad>" (ver degradación digna).
 */
export function postalAreaLabel(postalCode: string | null | undefined): string | null {
  if (!postalCode) return null;
  const area = POSTAL_CODES[postalCode];
  if (area) return area.name;
  const province = PROVINCE_BY_PREFIX[postalCode.slice(0, 2)];
  return province ? `${province} (provincia)` : null;
}

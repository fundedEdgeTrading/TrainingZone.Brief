// BI-3 (RB-LEAD-010 upgrade): CP completo (5 dígitos) → barrio/zona de Zaragoza
// capital. La primera puesta en preproducción solo tiene socios/leads de
// Zaragoza, así que el mapa de calor pasa de agrupar por provincia (2 dígitos
// del CP) a agrupar por barrio (CP completo) — a esa escala geográfica la
// provincia ya no aporta nada, interesa ver el detalle barrio a barrio.
//
// ⚠️ Aproximación, no fuente oficial: Correos no publica una tabla 1:1
// CP↔barrio (un mismo CP suele repartir calles entre varios barrios
// colindantes), así que esta correspondencia es un "mejor esfuerzo"
// construido cruzando varias fuentes públicas de código postal — suficiente
// para poblar un mapa de calor de demo/preproducción, pero a revisar con una
// fuente oficial (Ayuntamiento de Zaragoza / Correos) antes de usarse como
// dato definitivo de cara a producción real. Coordenadas aproximadas del
// centro de cada barrio (no centroides geocodificados con precisión).
//
// Este objeto ya NO se lee en tiempo de ejecución — es la fuente que
// prisma/seed.ts usa para poblar la tabla `PostalCodeArea` (ver
// schema.prisma), contra la que getPostalCodeStats (dashboard-queries.ts)
// hace el join real. Se mantiene aquí porque es más cómodo de editar como
// objeto TS que como fila de seed suelta.
//
// Para expandir el mapa a otras ciudades cuando dejen de ser solo clientes de
// Zaragoza, añadir aquí sus CP → barrio siguiendo el mismo formato (o crear
// un fichero por ciudad e importar ambos desde el seed).
export const ZARAGOZA_POSTAL_CODES: Record<string, { name: string; lat: number; lng: number }> = {
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

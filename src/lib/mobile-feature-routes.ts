import type { PlatformFeature } from "@/lib/platform-plans";

/**
 * Gateo por plan de la API móvil (E6-01, regla RB-PLAT-008). Es el espejo de
 * `FEATURE_BY_ROUTE` (rbac.ts) para las rutas que no pasan por el menú.
 *
 * Por qué existe: verificado en ejecución, con la organización demo en
 * `esencial_mes` (sin `salud_aptitud`), `GET /trainer/brief` devolvía 200 con
 * la lista completa y `GET /trainer/members?filter=alerts` devolvía el semáforo
 * y la zona de lesión. En web las dos redirigen a `/planes`. Session Brief,
 * semáforo de aptitud, zona de lesión y rangos de composición eran gratis
 * desde la app: fuga de ingresos directa.
 *
 * Las claves son rutas de la API móvil SIN el prefijo `/api/mobile/v1` y con
 * los segmentos dinámicos tal y como están en el sistema de ficheros
 * (`[id]`). **El gate se HEREDA a las rutas hijas**: declarar `/trainer/brief`
 * cubre `/trainer/brief/[id]` y `/trainer/brief/[id]/debrief`, así que añadir
 * una hija nueva no vuelve a abrir el agujero.
 */
export const MOBILE_FEATURE_BY_ROUTE: Record<string, PlatformFeature> = {
  // Session Brief y todo lo que cuelga de él (incluido el debrief).
  "/trainer/brief": "salud_aptitud",
  // El listado del entrenador pinta semáforo y zona de lesión.
  "/trainer/members": "salud_aptitud",
  // Metodología: mesociclos, se lean por donde se lean.
  "/mesocycles": "salud_aptitud",
  // Generación y refinado con IA: único módulo con coste marginal real
  // (~0,18 $ por generación, facturados a Apta). E6-03.
  "/trainer/members/[id]/mesocycles": "ia_programacion",
  // `/trainer/sessions/[id]/feedback` sale del mapa: E3-07 retiró la puntuación
  // por ejes del flujo de sala y la ruta responde 410 sin leer ni escribir
  // nada. Gatear por plan lo que ya no entrega ningún dato —y exigir token para
  // contestar "esto ya no existe"— solo dejaría una entrada que aparenta
  // proteger algo. El color de la sesión se gatea donde ahora se escribe.
  // El panel del entrenador es su día a día (agenda y pendientes): NO se gatea.
};

/**
 * Rutas declaradas explícitamente SIN gate. No es una lista de excepciones
 * cómoda: es el otro lado del mapa declarativo. Una ruta nueva que no esté ni
 * aquí ni en `MOBILE_FEATURE_BY_ROUTE` hace fallar el test de exhaustividad
 * (`mobile-feature-routes.test.ts`), nunca produce un 200 silencioso en
 * producción.
 */
export const MOBILE_ROUTES_WITHOUT_FEATURE: readonly string[] = [
  "/admin", // back-office del cliente: plan, centros, anuncios
  "/agenda", // trabajo del día: reservas, aforo, huecos de EP
  "/auth", // login, refresco y cierre de sesión
  "/capacity",
  "/checkout",
  "/leads",
  "/me",
  "/members", // ficha de socio: registrar y consultar NO se gatea (RB-PLAN-003)
  "/notifications",
  "/portal", // todo el lado del socio
  "/products",
  "/staff",
  "/tasks",
  "/trainer/panel",
  // E2-14: marcar y rectificar una falta es trabajo del día del entrenador,
  // como la agenda. Se declara aquí para que el test de exhaustividad no
  // dependa de que alguien se acuerde.
  "/trainer/bookings",
  // E3-07: la puntuación por ejes salió del flujo de sala y esta ruta responde
  // 410 sin leer ni escribir nada. Se declara aquí —y no en el mapa de gates—
  // para que el test de exhaustividad la siga cubriendo sin fingir que hay algo
  // que proteger detrás.
  "/trainer/sessions",
];

/** Normaliza a "/segmento/segmento", sin barra final ni prefijo de la API. */
export function normalizeMobileRoute(pathname: string): string {
  const withoutPrefix = pathname.replace(/^\/api\/mobile\/v1/, "");
  const trimmed = withoutPrefix.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Funcionalidad que cubre una ruta, con HERENCIA: gana la declaración más
 * específica (la coincidencia de prefijo más larga). `undefined` = sin gate.
 */
export function featureForMobileRoute(pathname: string): PlatformFeature | undefined {
  const route = normalizeMobileRoute(pathname);
  let best: { key: string; feature: PlatformFeature } | undefined;
  for (const [key, feature] of Object.entries(MOBILE_FEATURE_BY_ROUTE)) {
    if (route !== key && !route.startsWith(`${key}/`)) continue;
    if (!best || key.length > best.key.length) best = { key, feature };
  }
  return best?.feature;
}

/** ¿Está esta ruta cubierta por el mapa, aunque sea para decir que no se gatea? */
export function isMobileRouteDeclared(pathname: string): boolean {
  const route = normalizeMobileRoute(pathname);
  if (featureForMobileRoute(route)) return true;
  return MOBILE_ROUTES_WITHOUT_FEATURE.some((key) => route === key || route.startsWith(`${key}/`));
}

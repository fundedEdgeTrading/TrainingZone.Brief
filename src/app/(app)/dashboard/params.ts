/**
 * Estado del panel de control, que vive entero en la URL.
 *
 * El panel es un Server Component: si el centro, el periodo o la ordenación del
 * ranking vivieran en estado de cliente, cambiarlos no podría reconsultar nada
 * y el enlace dejaría de ser compartible ("mira Santander este trimestre" es un
 * enlace, no una secuencia de clics). Módulo sin dependencias de servidor: lo
 * importan tanto la página como los paneles.
 */
export type DashboardParams = {
  centerId?: string;
  range?: string;
  /** E14-06 · las dos fechas de `range=custom`, en `YYYY-MM-DD`. */
  desde?: string;
  hasta?: string;
  rankSort?: string;
  rankDir?: string;
  servicesOrderBy?: string;
};

export const DASHBOARD_PARAM_KEYS: (keyof DashboardParams)[] = [
  "centerId",
  "range",
  "desde",
  "hasta",
  "rankSort",
  "rankDir",
  "servicesOrderBy",
];

/**
 * `/dashboard` con los parámetros actuales y los cambios que se pidan. Un valor
 * vacío quita la clave en vez de dejarla puesta: así "Todos los centros" y "Mes"
 * —los valores por defecto— devuelven la URL limpia.
 */
export function dashboardHref(current: DashboardParams, overrides: Partial<DashboardParams> = {}): string {
  const merged = { ...current, ...overrides };
  // Las fechas solo tienen sentido con el periodo personalizado: arrastrarlas al
  // pulsar "Mes" dejaría un `?desde=` huérfano en la URL que no hace nada y que
  // reaparece al volver a "Personalizado" con lo que hubiera antes.
  if (merged.range !== "custom") {
    merged.desde = undefined;
    merged.hasta = undefined;
  }
  const url = new URLSearchParams();
  for (const key of DASHBOARD_PARAM_KEYS) {
    const value = merged[key];
    if (value) url.set(key, value);
  }
  const qs = url.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

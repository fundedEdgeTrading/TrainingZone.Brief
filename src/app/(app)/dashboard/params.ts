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
  rankSort?: string;
  rankDir?: string;
  servicesOrderBy?: string;
};

const KEYS: (keyof DashboardParams)[] = ["centerId", "range", "rankSort", "rankDir", "servicesOrderBy"];

/**
 * `/dashboard` con los parámetros actuales y los cambios que se pidan. Un valor
 * vacío quita la clave en vez de dejarla puesta: así "Todos los centros" y "Mes"
 * —los valores por defecto— devuelven la URL limpia.
 */
export function dashboardHref(current: DashboardParams, overrides: Partial<DashboardParams> = {}): string {
  const merged = { ...current, ...overrides };
  const url = new URLSearchParams();
  for (const key of KEYS) {
    const value = merged[key];
    if (value) url.set(key, value);
  }
  const qs = url.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

/**
 * Lectura de un eje de filtro desde la URL: los valores viajan separados por
 * coma (`?state=ACTIVE,TRIAL`). Vive aparte de `use-table-filters.ts` porque lo
 * usan también los server components y las rutas de API, y aquel módulo es
 * `"use client"`: sus exportaciones no son llamables desde el servidor.
 */
export function parseFilterValues(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

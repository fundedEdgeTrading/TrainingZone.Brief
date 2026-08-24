/**
 * Objetivos internos que el panel de dirección pinta como línea de referencia.
 *
 * Viven en su propio módulo, y no en `dashboard-queries.ts`, porque las
 * gráficas son componentes de cliente: importarlos desde el fichero de
 * consultas arrastraría Prisma al bundle del navegador.
 */

/** Ocupación objetivo. Pie del KPI "Ocupación media" y del panel por centro. */
export const OCCUPANCY_TARGET_PCT = 75;

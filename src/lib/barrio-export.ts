/**
 * E14-10 · Exportación de la tabla de códigos postales.
 *
 * La tabla pasa a ser vista de primera clase, y una vista de primera clase que
 * no se puede sacar a una hoja de cálculo es media vista: la conversación que
 * de verdad ocurre es «pásame los CP» y hoy la respuesta era una captura.
 *
 * Se construye **en el cliente**, con las filas que la pantalla ya tiene, y no
 * en una ruta de API. Dos razones, y ninguna es pereza:
 *
 *  · El fichero tiene que decir exactamente lo que se está mirando —esta
 *    ciudad, este periodo, este filtro de estado—. Una ruta nueva tendría que
 *    volver a resolver el ámbito de centro, el periodo y el filtro por su
 *    cuenta, y sería un segundo sitio donde esas tres cosas se pueden
 *    interpretar distinto. Ya pasó con el mapa y el panel contando cosas
 *    distintas bajo el mismo rótulo; no hace falta repetirlo.
 *  · Los datos ya han pasado el control de acceso al llegar al cliente
 *    (`center-scope.ts` en `page.tsx`). Exportar lo que ya se ve no amplía lo
 *    que se ve.
 *
 * Módulo puro (sin DOM): la descarga la dispara la vista; aquí solo se arma el
 * contenido, para poder probar sin navegador que las columnas dicen lo que
 * dicen y que un barrio sin dato sale vacío y no como un cero.
 */

import { BARRIO_METRICS, metricValue, type BarrioMetric, type BarrioStat } from "@/lib/barrio-map";
import { toCsv } from "@/lib/csv-export";

/** Lo que hay que declarar para que el fichero se pueda interpretar seis meses después. */
export type BarrioExportContext = {
  cityLabel: string;
  /** El pie del periodo activo, tal y como lo rotula el panel («trimestre en curso»). */
  rangeLabel: string;
  /** El filtro de estado activo, ya en prosa («Socios vivos»). */
  stateLabel: string;
  /** Nombre del centro activo, o null para todo el ámbito de quien mira. */
  centerLabel: string | null;
};

/**
 * Valor de una métrica para el CSV.
 *
 * Cadena vacía —no un cero— cuando la métrica no se puede calcular: es la misma
 * regla de E11-03 que ya hace que la celda de la pantalla ponga una raya. Un
 * cero en una hoja de cálculo se suma, se promedia y acaba en una decisión de
 * inversión; una celda vacía, no.
 *
 * Los decimales van con COMA: el CSV es el formato español de `csv-export.ts`
 * (punto y coma de separador, BOM), y un `0.5` con punto lo lee Excel en
 * español como texto o como 5.
 */
function exportCell(point: BarrioStat, metric: BarrioMetric): string {
  const value = metricValue(point, metric);
  if (value === null) return "";
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

/**
 * La tabla entera en CSV: una fila por código postal, con las SIETE métricas —
 * las tres que pidió negocio (clientes, leads, conversión) y las cuatro que ya
 * estaban y que el plano solo puede enseñar de una en una.
 *
 * `rows` llega ya ordenado por la métrica activa: el fichero sale en el mismo
 * orden que la pantalla, porque un export que reordena por su cuenta obliga a
 * comprobar a mano que es el mismo dato.
 */
export function barrioTableCsv(rows: BarrioStat[], context: BarrioExportContext): string {
  const headers = [
    "CodigoPostal",
    "Barrio",
    ...BARRIO_METRICS.map((m) => m.label),
    "Centro mas cercano",
    "Ciudad",
    "Periodo",
    "Estado",
    "Centro",
  ];

  const body = rows.map((point) => [
    point.code,
    point.name,
    ...BARRIO_METRICS.map((m) => exportCell(point, m.key)),
    point.nearestCenter ?? "",
    context.cityLabel,
    // El periodo y el filtro viajan EN CADA FILA y no en una cabecera suelta:
    // una cabecera se pierde en cuanto alguien pega las filas en otra hoja, y
    // entonces el fichero deja de saber de qué trimestre era.
    context.rangeLabel,
    context.stateLabel,
    context.centerLabel ?? "Todos los centros",
  ]);

  return toCsv(headers, body);
}

/** `codigos-postales-zaragoza-2026-09-15.csv`: ciudad y fecha, para no acabar con seis «export (3).csv». */
export function barrioExportFileName(cityLabel: string, now: Date): string {
  const slug = cityLabel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `codigos-postales-${slug || "barrios"}-${now.toISOString().slice(0, 10)}.csv`;
}

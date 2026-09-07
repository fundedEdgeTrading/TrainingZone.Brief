"use client";

import {
  BARRIO_METRICS,
  formatMetricValue,
  metricValue,
  type BarrioMetric,
  type BarrioStat,
} from "@/lib/barrio-map";

/**
 * E11-04 · La vía no cartográfica al dato.
 *
 * Bajo 1024 px se perdían el ranking y la tarjeta de foco; bajo 768 px se
 * perdían además la leyenda y el selector de ciudad, y lo que quedaba era **un
 * mapa de colores sin escala**. Un mapa sin leyenda no es un mapa degradado: es
 * un mapa incorrecto, porque el color deja de significar nada y sigue pareciendo
 * que significa algo.
 *
 * Y los polígonos son `<path>` con manejadores de ratón: no son focusables, no
 * tienen `role` ni `tabindex`, así que quien no usa ratón no tenía forma de leer
 * el mapa. Esta tabla es esa forma, y no es un apaño accesible aparte: es la
 * misma información, ordenable, con las seis métricas a la vez —cosa que el
 * mapa no puede hacer, porque solo pinta una— y sincronizada con el foco.
 *
 * La cabecera de una métrica ordena Y cambia la métrica activa del mapa. Son la
 * misma acción a propósito: dos estados que se pueden separar son dos estados
 * que acaban discrepando.
 */
export function BarrioTable({
  rows,
  metric,
  colors,
  hovered,
  focus,
  onMetric,
  onHover,
  onSelect,
  geometryNote,
}: {
  rows: BarrioStat[];
  metric: BarrioMetric;
  colors: Record<string, string>;
  hovered: string | null;
  focus: string | null;
  onMetric: (metric: BarrioMetric) => void;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
  /** Las aproximaciones encadenadas que la tabla tiene que declarar (E11-05). */
  geometryNote: string;
}) {
  return (
    <table className="w-full border-collapse text-left">
      {/* La fuente del dato y sus aproximaciones van en el `<caption>` y no en
          una nota al pie suelta: es la única parte de la tabla que un lector de
          pantalla anuncia ANTES de leer las filas. */}
      <caption className="text-left text-[10.5px] leading-[1.45] text-brand-muted pb-2">
        Socios y leads de tu organización agregados por código postal. {geometryNote}
      </caption>
      <thead>
        <tr className="border-b border-tz-sand">
          <th
            scope="col"
            className="sticky top-0 z-[1] bg-brand-card/95 backdrop-blur-md py-1.5 pr-2 text-[10px] font-bold uppercase tracking-[.06em] text-brand-faint"
          >
            Barrio
          </th>
          {BARRIO_METRICS.map((m) => (
            <th
              key={m.key}
              scope="col"
              // `aria-sort` es lo que hace que un lector de pantalla diga "columna
              // ordenada descendente" en vez de callarse.
              aria-sort={m.key === metric ? (m.key === "conv" ? "ascending" : "descending") : "none"}
              className="sticky top-0 z-[1] bg-brand-card/95 backdrop-blur-md py-1.5 px-1 text-right"
            >
              <button
                type="button"
                onClick={() => onMetric(m.key)}
                // El nombre accesible dice lo que HACE, no lo que rotula: así no
                // se confunde con la pastilla de métrica del mapa, que se llama
                // igual y hace lo mismo desde otro sitio.
                aria-label={`Ordenar por ${m.label}`}
                title={`Ordenar por ${m.label} y pintar el mapa con esta métrica`}
                className={`w-full min-h-[44px] px-1 text-right text-[10px] font-bold uppercase tracking-[.06em] transition-colors duration-150 ${
                  m.key === metric ? "text-brand-text" : "text-brand-faint hover:text-brand-text-2"
                }`}
              >
                {m.label}
                <span aria-hidden="true" className="ml-1">
                  {m.key === metric ? "▾" : ""}
                </span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const active = p.code === hovered || p.code === focus;
          return (
            <tr
              key={p.code}
              onMouseEnter={() => onHover(p.code)}
              onMouseLeave={() => onHover(null)}
              className={`border-b border-tz-sand/60 last:border-0 ${active ? "bg-tz-sand" : ""}`}
            >
              <th scope="row" className="font-normal py-0.5 pr-2">
                <button
                  type="button"
                  onClick={() => onSelect(p.code)}
                  aria-pressed={p.code === focus}
                  className="flex items-center gap-2 w-full min-h-[44px] text-left text-[12px] font-semibold text-brand-text"
                >
                  <span
                    aria-hidden="true"
                    className="w-2 h-[22px] rounded-[3px] shrink-0"
                    style={{ background: colors[p.code] }}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              </th>
              {BARRIO_METRICS.map((m) => (
                <td
                  key={m.key}
                  className={`py-0.5 px-1 text-right text-[11.5px] tz-nums whitespace-nowrap ${
                    m.key === metric ? "font-extrabold text-brand-text" : "text-brand-text-2"
                  }`}
                >
                  {formatMetricValue(metricValue(p, m.key), m.key)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

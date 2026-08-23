"use client";

import { Fragment, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { EmptyState } from "@/components/ui/empty-state";

export type SortDir = "asc" | "desc";

export type DataTableColumn = {
  key: string;
  header: React.ReactNode;
  /** false/omitted = columna no ordenable (p.ej. una columna de acciones). */
  sortable?: boolean;
  className?: string;
  thClassName?: string;
  align?: "left" | "right" | "center";
  /**
   * Oculta la columna en la vista de tarjetas (móvil). Útil para columnas que
   * solo tienen sentido junto al resto de la fila (un índice, un separador).
   */
  hideOnCard?: boolean;
  /**
   * Disparador del panel de filtro de esta columna (variante «filtros en
   * columna»): el filtro vive en la cabecera del dato que filtra. Se pinta a la
   * derecha del rótulo y solo en la tabla — en la vista de tarjetas de móvil no
   * hay cabeceras, así que quien llama debe ofrecer los mismos ejes en el riel.
   */
  filter?: React.ReactNode;
  /** Subraya la columna en oro mientras su filtro tiene algún valor. */
  filterActive?: boolean;
  /**
   * Clase de la celda en la vista de tarjetas de móvil, cuando no sirve la de
   * la tabla. Lo usan las columnas que se ocultan por ancho (`hidden
   * xl:table-cell`): en una tarjeta sí caben, y sin esto se quedaba la etiqueta
   * con el valor oculto.
   */
  cardClassName?: string;
};

export type DataTableRow = {
  key: string;
  /** Contenido ya renderizado por columna (server component), indexado por `column.key`. */
  cells: Record<string, React.ReactNode>;
  /**
   * Valor comparable por columna para ordenar en cliente (string/number ya
   * calculados en el server component — nunca funciones: no pueden cruzar el
   * límite server/client de React).
   */
  sortValues?: Record<string, string | number | null | undefined>;
  className?: string;
  style?: React.CSSProperties;
};

const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/** Punto en el que la tabla deja paso a las tarjetas (el `sm` de Tailwind). */
const CARD_QUERY = "(max-width: 639px)";

/**
 * `true` mientras la ventana sea estrecha. Se resuelve en cliente: en el
 * servidor no hay ventana, así que el HTML inicial es siempre la tabla y el
 * navegador cambia a tarjetas al hidratar si toca. Se hace así —y no con
 * `hidden`/`sm:hidden`— para no meter cada fila dos veces en el DOM, que
 * duplicaría cada enlace y cada celda de cara a un lector de pantalla.
 */
function useIsNarrow() {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(CARD_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(CARD_QUERY).matches,
    () => false,
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("shrink-0 transition-[opacity,transform] duration-150", active ? "opacity-100" : "opacity-25")}
      style={{ transform: active && dir === "desc" ? "rotate(180deg)" : undefined }}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function DataTable({
  columns,
  rows,
  pageSize = 12,
  defaultSort,
  emptyTitle = "Sin resultados",
  emptyDescription,
  pagination = true,
  maxBodyHeight = "560px",
  cardTitleKey,
  density = "default",
  toolbar,
  className,
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  pageSize?: number;
  defaultSort?: { key: string; dir: SortDir };
  emptyTitle?: string;
  emptyDescription?: string;
  /** Poner a false cuando quien llama ya pagina (p.ej. servidor). */
  pagination?: boolean;
  maxBodyHeight?: string;
  /**
   * Columna que hace de título en la vista de tarjetas de móvil. Por defecto la
   * primera, que en todas las tablas de la app es la que identifica la fila.
   */
  cardTitleKey?: string;
  /**
   * `compact` es la densidad del rediseño de filtros (celda 10/20 px, avatar de
   * 32): con la barra de filtros reducida a 58 px caben más filas en pantalla
   * sin que la tabla se lea apretada.
   */
  density?: "compact" | "default";
  /**
   * Riel propio de la tarjeta (búsqueda, recuento, ejes sin columna visible).
   * Se pinta también cuando no hay filas: si el riel desapareciera con el
   * listado vacío, un filtro que no devuelve nada dejaría al usuario sin forma
   * de deshacerlo.
   */
  toolbar?: React.ReactNode;
  className?: string;
}) {
  const isNarrow = useIsNarrow();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(defaultSort ?? null);
  /**
   * Sube en cada reordenación Y con cada nuevo juego de filas (filtro
   * aplicado): se usa como `key` del `<tbody>` para rearmar la entrada
   * escalonada. Sin botón «Filtrar», ese reentrada es parte de la confirmación
   * de que el filtro se ha aplicado.
   */
  const [sortRun, setSortRun] = useState(0);
  const [page, setPage] = useState(1);

  // `rows` solo cambia de referencia cuando el server component padre vuelve a
  // ejecutar la query (nueva navegación/filtro), no cuando este componente
  // reordena o pagina por su cuenta: es una señal segura para volver a la
  // página 1. Ajuste de estado durante el render (no en un efecto), como
  // recomienda React para "resetear estado cuando cambia una prop".
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setPage(1);
    setSortRun((n) => n + 1);
  }

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortable) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a.sortValues?.[sort.key];
      const bv = b.sortValues?.[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "es", { sensitivity: "base", numeric: true }) * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = pagination ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const pageRows = pagination ? sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize) : sortedRows;

  function handleSort(key: string) {
    setPage(1);
    setSortRun((n) => n + 1);
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  }

  if (rows.length === 0) {
    return (
      <div className={clsx("bg-brand-card border border-brand-border rounded-card shadow-card", className)}>
        {toolbar}
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const titleKey = cardTitleKey ?? columns[0]?.key;
  const cardColumns = columns.filter((c) => c.key !== titleKey && !c.hideOnCard);
  const titleColumn = columns.find((c) => c.key === titleKey);
  const sortableColumns = columns.filter((c) => c.sortable);

  return (
    <div className={clsx("bg-brand-card border border-brand-border rounded-card overflow-hidden shadow-card", className)}>
      {toolbar}
      {/* Móvil: una tarjeta por fila. Una tabla de 5 columnas no cabe en 375 px
          y obligaba a arrastrar en horizontal para leer cada registro. */}
      {isNarrow ? (
      <div>
        {sortableColumns.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-tz-sand px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Ordenar</span>
            {sortableColumns.map((col) => (
              <button
                key={col.key}
                type="button"
                onClick={() => handleSort(col.key)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  sort?.key === col.key
                    ? "border-brand-ink bg-tz-black text-tz-bone"
                    : "border-brand-border text-brand-text-2 hover:bg-tz-bone",
                )}
              >
                {col.header}
                {sort?.key === col.key && <SortIcon active dir={sort.dir} />}
              </button>
            ))}
          </div>
        )}
        <ul key={sortRun}>
          {pageRows.map((row, i) => (
            <li
              key={row.key}
              className={clsx("border-t border-tz-sand px-4 py-3.5 first:border-t-0", row.className)}
              style={
                sortRun > 0
                  ? { ...row.style, animation: `tzRowIn .34s ${(Math.min(i, 12) * 0.028).toFixed(3)}s both` }
                  : row.style
              }
            >
              {titleColumn && <div className="min-w-0 text-sm">{row.cells[titleColumn.key]}</div>}
              {cardColumns.length > 0 && (
                <dl className="mt-2.5 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  {cardColumns.map((col) => (
                    <Fragment key={col.key}>
                      <dt className="min-w-0 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted leading-[1.7]">
                        {col.header}
                      </dt>
                      <dd className={clsx("min-w-0 break-words", col.cardClassName ?? col.className)}>
                        {row.cells[col.key]}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </div>

      ) : (
      /* Tablet en adelante: la tabla de siempre. */
      <div className="overflow-auto" style={{ maxHeight: maxBodyHeight }}>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-tz-bone text-brand-muted text-[11px] font-bold uppercase tracking-[0.08em] shadow-[0_1px_0_var(--color-tz-sand)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  data-menu-root={col.filter ? "1" : undefined}
                  className={clsx(
                    "relative text-left px-3 lg:px-5 py-3 whitespace-nowrap",
                    ALIGN_CLASS[col.align ?? "left"],
                    col.filterActive && "text-brand-text",
                    col.thClassName,
                  )}
                >
                  <span className={clsx("inline-flex items-center gap-2", col.align === "right" && "flex-row-reverse")}>
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={clsx(
                          "inline-flex items-center gap-1.5 uppercase tracking-[0.08em] font-bold text-[11px] hover:text-brand-text transition-colors cursor-pointer",
                          col.filterActive ? "text-brand-text" : "text-brand-muted",
                          col.align === "right" && "flex-row-reverse"
                        )}
                      >
                        {col.header}
                        <SortIcon active={sort?.key === col.key} dir={sort?.key === col.key ? sort.dir : "asc"} />
                      </button>
                    ) : (
                      col.header
                    )}
                    {col.filter}
                  </span>
                  {/* Subrayado dorado: hace visible de un vistazo por qué
                      columna se está filtrando, sin abrir ningún panel. */}
                  {col.filterActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 lg:inset-x-5 bottom-0 h-0.5 rounded-t-[2px]"
                      style={{
                        background: "linear-gradient(90deg,#e3cfa2,#b58e52)",
                        transformOrigin: "left",
                        animation: "tzGrow .34s var(--ease-out-soft) both",
                      }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody key={sortRun}>
            {pageRows.map((row, i) => (
              <tr
                key={row.key}
                className={clsx("border-t border-tz-sand transition-colors duration-150 hover:bg-tz-bone/70", row.className)}
                style={
                  // Al reordenar, todas las filas vuelven a entrar escalonadas
                  // para que el cambio de orden se lea. El `sortRun` en la key
                  // del `<tbody>` rearma la animación; mientras nadie ha
                  // reordenado manda el estilo de entrada que trae la fila.
                  sortRun > 0
                    ? { ...row.style, animation: `tzRowIn .34s ${(Math.min(i, 12) * 0.028).toFixed(3)}s both` }
                    : row.style
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "px-3 lg:px-5",
                      density === "compact" ? "py-2.5" : "py-3.5",
                      ALIGN_CLASS[col.align ?? "left"],
                      col.className,
                    )}
                  >
                    {row.cells[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {pagination && pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-t border-tz-sand text-[12.5px] text-brand-muted">
          <span>
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedRows.length)} de {sortedRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-brand-border text-brand-text-2 hover:bg-tz-bone disabled:opacity-35 disabled:pointer-events-none transition-colors"
              aria-label="Página anterior"
            >
              ‹
            </button>
            <span className="px-2 font-semibold text-brand-text-2 tz-nums">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage === pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-brand-border text-brand-text-2 hover:bg-tz-bone disabled:opacity-35 disabled:pointer-events-none transition-colors"
              aria-label="Página siguiente"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

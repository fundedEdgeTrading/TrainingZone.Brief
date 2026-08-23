"use client";

import clsx from "clsx";

import { FilterMenu } from "@/components/ui/filter-menu";
import { FilterSweep, type FilterGroup, type ResultLabel } from "@/components/ui/filter-toolbar";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTableFilters } from "@/lib/use-table-filters";

const TONE_DOT: Record<string, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  trial: "bg-trial",
  prospect: "bg-prospect",
  neutral: "bg-neutral",
  gold: "bg-gold",
};

/** Ancho por debajo del cual `DataTable` pinta tarjetas y no hay cabeceras. */
const CARD_QUERY = "(max-width: 639px)";

/**
 * Riel de la variante «filtros en columna»: 44 px dentro de la propia tarjeta de
 * la tabla, con la búsqueda, el recuento vivo y los ejes que no tienen columna
 * donde vivir. El resto de ejes se filtran desde la cabecera de su columna
 * (`ColumnFilter`), que es lo que ahorra los 58 px de la barra.
 *
 * Por debajo de 640 px `DataTable` deja de pintar cabeceras (una fila pasa a ser
 * una tarjeta), así que ahí el riel recupera TODOS los ejes como píldoras: sin
 * eso, en móvil no habría forma de filtrar.
 *
 * La tira de chips activos vive aquí y no en la barra: con el listado vacío es
 * la única forma de deshacer el filtro que lo ha vaciado.
 */
export function FilterRail({
  groups,
  railAxes = [],
  total,
  resultLabel,
  searchName = "q",
  searchPlaceholder = "Buscar...",
}: {
  groups: FilterGroup[];
  /** Ejes sin columna visible: se muestran siempre como píldora. */
  railAxes?: string[];
  total: number;
  resultLabel: ResultLabel;
  searchName?: string;
  searchPlaceholder?: string;
}) {
  const isNarrow = useMediaQuery(CARD_QUERY);
  const { values, query, setQuery, toggle, setAxis, clearAxis, clearAll, hasFilters, filterKey } = useTableFilters(
    groups.map((g) => g.name),
    searchName,
  );

  const pillGroups = groups.filter((g) => isNarrow || railAxes.includes(g.name));

  const chips = groups.flatMap((group) =>
    group.single
      ? []
      : (values[group.name] ?? []).map((value) => {
          const option = group.options.find((o) => o.value === value);
          return {
            axis: group.name,
            group: group.label,
            value,
            label: option?.label ?? value,
            tone: option?.tone,
          };
        }),
  );

  return (
    <div className="border-b border-tz-sand">
      <div data-menu-root="1" className="relative flex flex-wrap items-center gap-3 px-4 py-2.5 lg:px-5">
        <span aria-hidden="true" className="flex shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-apta-gold)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="min-w-[140px] flex-auto border-0 bg-transparent py-1 text-sm text-brand-text placeholder:text-faint outline-none"
        />

        {pillGroups.map((group) => {
          const selected = values[group.name] ?? [];
          const selectedOption = group.single ? group.options.find((o) => o.value === selected[0]) : undefined;
          return (
            <FilterMenu
              key={group.name}
              label={selectedOption ? `${group.label} · ${selectedOption.label}` : group.label}
              options={group.options}
              selected={selected}
              showCount={!group.single}
              width={group.width}
              align="right"
              onToggle={(value) =>
                group.single ? setAxis(group.name, selected[0] === value ? null : value) : toggle(group.name, value)
              }
              onClear={() => clearAxis(group.name)}
            />
          );
        })}

        <span
          aria-live="polite"
          className="inline-flex shrink-0 items-baseline gap-[5px] whitespace-nowrap pl-0.5 text-[12.5px] text-brand-muted"
        >
          <b
            key={filterKey}
            className="tz-nums font-bold text-brand-text"
            style={{ animation: "tzRollUp .42s var(--ease-out-soft) both" }}
          >
            {total}
          </b>
          {total === 1 ? resultLabel.one : resultLabel.many}
        </span>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-brand-muted transition-colors hover:bg-tz-bone hover:text-brand-text"
            style={{ animation: "tzChipIn .24s var(--ease-spring) both" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Limpiar
          </button>
        )}

        <FilterSweep filterKey={filterKey} radius="0" />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-tz-sand px-4 py-2.5 lg:px-5">
          {chips.map((chip) => (
            <span
              key={`${chip.axis}:${chip.value}`}
              className="inline-flex items-center gap-2 rounded-pill border border-brand-border bg-brand-card py-[5px] pl-[11px] pr-[5px] text-[12.5px] font-semibold text-brand-text-2"
              style={{ boxShadow: "0 1px 2px rgba(29,29,28,.04)", animation: "tzChipIn .28s var(--ease-spring) both" }}
            >
              <span
                aria-hidden="true"
                className={clsx("h-[7px] w-[7px] shrink-0 rounded-[2px]", chip.tone ? TONE_DOT[chip.tone] : "bg-faint")}
              />
              <span className="font-medium text-faint">{chip.group}</span>
              {chip.label}
              <button
                type="button"
                onClick={() => toggle(chip.axis, chip.value)}
                aria-label={`Quitar filtro ${chip.group}: ${chip.label}`}
                className="inline-flex h-[19px] w-[19px] items-center justify-center rounded-pill text-faint transition-colors hover:bg-tz-bone hover:text-brand-text"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

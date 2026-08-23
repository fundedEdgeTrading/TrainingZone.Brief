"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { FilterMenu, type FilterOption } from "@/components/ui/filter-menu";
import { useTableFilters } from "@/lib/use-table-filters";

export type { FilterOption };

export type FilterGroup = {
  /** Parámetro de URL del eje. */
  name: string;
  label: string;
  /** Ancho del panel (ver anchos por eje del handoff). */
  width?: number;
  options: FilterOption[];
  /**
   * Selección única: el valor elegido sustituye al anterior en vez de sumarse.
   * Lo usa el orden del listado, que no es combinable consigo mismo.
   */
  single?: boolean;
};

export type ResultLabel = { one: string; many: string };

/**
 * Barra de filtros unificada: una sola fila de 58 px, siempre visible, con
 * desplegables de selección múltiple que se aplican al instante. Sustituye a la
 * tarjeta `FilterBar` de ~330 px con botón «Filtrar» que abría cada listado.
 *
 * Al no haber botón hace falta una confirmación explícita de que el filtro se
 * ha aplicado: un barrido dorado recorre el borde inferior de la barra
 * (`tzSweep`), el recuento rueda (`tzRollUp`) y las filas vuelven a entrar
 * escalonadas (lo hace `DataTable` al cambiar la referencia de `rows`). El
 * elemento del barrido se remonta con `key={filterKey}` para relanzar la
 * animación, misma técnica que `sortRun` en `DataTable`.
 */
export function FilterToolbar({
  groups,
  total,
  resultLabel,
  searchName = "q",
  searchPlaceholder = "Buscar...",
  sticky = true,
  extra,
  extraAxes = [],
  className,
}: {
  groups: FilterGroup[];
  /** Filas que quedan tras aplicar los filtros: es el aviso de que algo cambió. */
  total: number;
  resultLabel: ResultLabel;
  searchName?: string;
  searchPlaceholder?: string;
  sticky?: boolean;
  /** Píldora propia de una vista (p. ej. el rango de fechas de auditoría). */
  extra?: React.ReactNode;
  /** Parámetros que gobierna `extra`: entran en «Limpiar» y en el contador. */
  extraAxes?: string[];
  className?: string;
}) {
  const axes = [...groups.map((g) => g.name), ...extraAxes];
  const { values, query, setQuery, toggle, setAxis, clearAxis, clearAll, hasFilters, isPending, filterKey } =
    useTableFilters(axes, searchName);

  const chips = groups.flatMap((group) =>
    group.single
      ? []
      : (values[group.name] ?? []).map((value) => ({
          axis: group.name,
          group: group.label,
          value,
          label: group.options.find((o) => o.value === value)?.label ?? value,
          tone: group.options.find((o) => o.value === value)?.tone,
        })),
  );

  return (
    <div
      className={clsx(
        // El contenedor con scroll es el `<main>` del layout: `top-0` pega la
        // barra a su borde superior. El degradado de 2 px evita que las filas
        // asomen por el borde al desplazar.
        sticky && "sticky top-0 z-30 pb-0.5",
        className,
      )}
      style={
        sticky
          ? { background: "linear-gradient(180deg,var(--color-brand-bg) 78%,transparent)" }
          : undefined
      }
    >
      <div
        data-menu-root="1"
        className="relative flex items-center gap-3 rounded-card border border-brand-border bg-brand-card px-3.5 py-[9px]"
        style={{ boxShadow: "0 1px 2px rgba(29,29,28,.04), 0 6px 24px -14px rgba(29,29,28,.16)" }}
      >
        {/* Mismo icono y misma caja que el `kicker` de la barra anterior:
            mantiene el reconocimiento del bloque tras quitarle el rótulo. */}
        <span
          aria-hidden="true"
          className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-tz-black"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-tz-bone)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4h18l-7 8v6l-4 2v-8z" />
          </svg>
        </span>

        <div className="relative min-w-[170px] max-w-[280px] flex-auto">
          <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-1/2 flex -translate-y-1/2">
            <svg
              width="17"
              height="17"
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
            className="w-full border-0 bg-transparent py-2 pl-[26px] pr-2 text-sm text-brand-text placeholder:text-faint outline-none"
          />
        </div>

        <span aria-hidden="true" className="h-[26px] w-px shrink-0 bg-tz-sand" />

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {groups.map((group) => {
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
                onToggle={(value) =>
                  group.single
                    ? setAxis(group.name, selected[0] === value ? null : value)
                    : toggle(group.name, value)
                }
                onClear={() => clearAxis(group.name)}
              />
            );
          })}
          {extra}
        </div>

        <span className="flex-auto" />

        <span
          aria-live="polite"
          className="inline-flex shrink-0 items-baseline gap-[5px] whitespace-nowrap text-[13px] text-brand-muted"
        >
          {/* Sin botón, el recuento es el único aviso de que el listado cambió. */}
          <b key={filterKey} className="tz-nums font-bold text-brand-text" style={{ animation: "tzRollUp .42s var(--ease-out-soft) both" }}>
            {total}
          </b>
          {total === 1 ? resultLabel.one : resultLabel.many}
        </span>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-[11px] py-[7px] text-[12.5px] font-semibold whitespace-nowrap text-brand-muted transition-colors hover:bg-tz-bone hover:text-brand-text"
            style={{ animation: "tzChipIn .24s var(--ease-spring) both" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Limpiar
          </button>
        )}

        {isPending && <span className="sr-only">Aplicando filtros…</span>}
        <FilterSweep filterKey={filterKey} />
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 px-0.5">
          {chips.map((chip) => (
            <span
              key={`${chip.axis}:${chip.value}`}
              className="inline-flex items-center gap-2 rounded-pill border border-brand-border bg-brand-card py-[5px] pl-[11px] pr-[5px] text-[12.5px] font-semibold text-brand-text-2"
              style={{
                boxShadow: "0 1px 2px rgba(29,29,28,.04)",
                animation: "tzChipIn .28s var(--ease-spring) both",
              }}
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

const TONE_DOT: Record<string, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  trial: "bg-trial",
  prospect: "bg-prospect",
  neutral: "bg-neutral",
  gold: "bg-gold",
};

/**
 * Barrido dorado pegado al borde inferior: la confirmación que antes daba el
 * botón «Filtrar». Se remonta con la `key` para relanzar la animación.
 */
export function FilterSweep({ filterKey, radius = "0 0 15px 15px" }: { filterKey: string; radius?: string }) {
  // No barre en la primera pintura: el barrido confirma un cambio de filtro, no
  // la carga de la página. `runs` sube con cada cambio y remonta el elemento,
  // que es lo que relanza la animación.
  const [runs, setRuns] = useState(0);
  const previous = useRef(filterKey);
  useEffect(() => {
    if (previous.current === filterKey) return;
    previous.current = filterKey;
    setRuns((n) => n + 1);
  }, [filterKey]);

  if (runs === 0) return null;

  return (
    <span
      key={runs}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      style={{ borderRadius: radius }}
    >
      <span
        className="block h-full"
        style={{
          background: "linear-gradient(90deg,var(--color-brand-ink),var(--color-apta-gold) 55%,var(--color-tz-sand))",
          transformOrigin: "left",
          animation: "tzSweep .62s var(--ease-out-soft) both",
        }}
      />
    </span>
  );
}

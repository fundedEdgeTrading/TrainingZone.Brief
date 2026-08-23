"use client";

import { FilterMenu } from "@/components/ui/filter-menu";
import { useTableFilters } from "@/lib/use-table-filters";

function short(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Eje de rango de fechas del registro de auditoría: los dos `input[type=date]`
 * que antes ocupaban una fila del formulario, ahora dentro del panel de una
 * píldora más de la barra. Se escriben juntos (`setValues`) porque son un solo
 * filtro: dos escrituras seguidas en el mismo tick se pisarían.
 */
export function AuditDateFilter() {
  const { values, setValues } = useTableFilters(["from", "to"]);
  const from = values.from?.[0] ?? "";
  const to = values.to?.[0] ?? "";

  const label =
    from && to
      ? `Fechas · ${short(from)}–${short(to)}`
      : from
        ? `Desde ${short(from)}`
        : to
          ? `Hasta ${short(to)}`
          : "Fechas";

  return (
    <FilterMenu
      label={label}
      options={[]}
      selected={[from, to].filter(Boolean)}
      showCount={false}
      width={252}
      onClear={() => setValues({ from: null, to: null })}
    >
      <div className="flex flex-col gap-2.5 px-2 pb-1.5 pt-1">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">Desde</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setValues({ from: e.target.value || null })}
            className="w-full rounded-control border border-brand-border bg-input px-3 py-2 text-[13.5px] text-brand-text outline-none focus:border-brand-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">Hasta</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setValues({ to: e.target.value || null })}
            className="w-full rounded-control border border-brand-border bg-input px-3 py-2 text-[13.5px] text-brand-text outline-none focus:border-brand-ink"
          />
        </label>
      </div>
    </FilterMenu>
  );
}

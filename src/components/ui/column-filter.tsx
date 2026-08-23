"use client";

import { FilterMenu, type FilterOption } from "@/components/ui/filter-menu";
import { useTableFilters } from "@/lib/use-table-filters";

/**
 * Disparador de filtro en la cabecera de una columna (variante «filtros en
 * columna»): un glifo de embudo junto al rótulo que abre el mismo panel
 * multi-selección que usa la barra. Se pasa a `DataTable` en `column.filter`.
 *
 * Lee su propia selección de la URL, así que se mantiene en sincronía con el
 * riel y con la tira de chips sin compartir estado entre componentes.
 */
export function ColumnFilter({
  axis,
  label,
  options,
  width,
}: {
  axis: string;
  label: string;
  options: FilterOption[];
  width?: number;
}) {
  const { values, toggle, clearAxis } = useTableFilters([axis]);
  const selected = values[axis] ?? [];

  return (
    <FilterMenu
      variant="glyph"
      label={label}
      options={options}
      selected={selected}
      width={width}
      onToggle={(value) => toggle(axis, value)}
      onClear={() => clearAxis(axis)}
    />
  );
}

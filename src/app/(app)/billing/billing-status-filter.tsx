"use client";

import { FilterMenu } from "@/components/ui/filter-menu";
import { useTableFilters } from "@/lib/use-table-filters";

/**
 * Estado de los pagos como píldora de la misma familia que el resto de filtros
 * (multi-selección, se aplica al instante). Cobros no lleva barra completa: no
 * hay búsqueda que poner en ella, solo este eje.
 */
export function BillingStatusFilter({ options }: { options: { value: string; label: string; tone?: "good" | "warning" | "critical" | "neutral" }[] }) {
  const { values, toggle, clearAxis } = useTableFilters(["status"]);

  return (
    <FilterMenu
      label="Estado"
      options={options}
      selected={values.status ?? []}
      width={244}
      align="right"
      onToggle={(value) => toggle("status", value)}
      onClear={() => clearAxis("status")}
    />
  );
}

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * E14-13 · la tarjeta agrupada.
 *
 * Varias tareas de la misma regla se ven como UNA con su contador, y se
 * despliega para verlas de una en una.
 *
 * **No hay estado de grupo.** El contador es `tasks.length` y nada más; abrir y
 * cerrar el desplegable es lo único que vive en el componente. Cerrar el grupo
 * llama a `completeTasksAction`, que cierra las tareas una a una por
 * `resolveNotification` —el único camino a «Hecha», compartido con la campana y
 * con el cron—, y el repintado vuelve a contar lo que quede. Por eso cerrar una
 * suelta baja el contador sin que nadie tenga que mantenerlo: no hay nada que
 * mantener.
 */
export function TaskGroupCard({
  label,
  count,
  pending,
  onCompleteAll,
  children,
}: {
  label: string;
  count: number;
  pending: boolean;
  onCompleteAll: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-task-group={label}
      className="rounded-control border border-brand-border bg-white overflow-hidden"
    >
      <div className="p-2.5">
        <button
          type="button"
          data-no-drag
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start gap-2 text-left"
        >
          <span aria-hidden className={`mt-0.5 text-faint text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>
            ▶
          </span>
          {/* El rótulo puede partir en dos líneas: en una columna del tablero
              no cabe en una, y recortarlo deja «Bono acabándo…». */}
          <span className="flex-1 min-w-0 font-semibold text-sm text-brand-text">{label}</span>
          <Badge tone="neutral" dot={false} className="shrink-0">
            {count}
          </Badge>
        </button>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-faint min-w-0 truncate">
            {open ? "Automáticas de la misma regla" : `${count} automáticas de la misma regla`}
          </span>
          <button
            type="button"
            data-no-drag
            disabled={pending}
            onClick={onCompleteAll}
            className="shrink-0 text-[11px] font-bold uppercase text-brand-muted hover:text-brand-text disabled:opacity-50"
          >
            Completar {count}
          </button>
        </div>
      </div>

      {/* Se monta solo al desplegar: una columna con veinte grupos abiertos de
          golpe sería la misma pared de tarjetas que se está arreglando. */}
      {open && <div className="border-t border-tz-sand p-2 space-y-2 bg-surface-soft">{children}</div>}
    </div>
  );
}

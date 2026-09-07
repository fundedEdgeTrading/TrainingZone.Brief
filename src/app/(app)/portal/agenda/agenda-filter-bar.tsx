import Link from "next/link";
import type { AgendaDayOption, AgendaModality } from "./agenda-filters";
import { SERVICE_LABEL } from "@/lib/service-labels";

const MODALITIES: AgendaModality[] = ["GROUP", "EP"];

function hrefFor(day: string | undefined, modality: AgendaModality | undefined) {
  const params = new URLSearchParams();
  if (day) params.set("dia", day);
  if (modality) params.set("modalidad", modality);
  const qs = params.toString();
  return qs ? `/portal/agenda?${qs}` : "/portal/agenda";
}

function pillClass(active: boolean) {
  return `shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[.03em] transition-colors duration-150 ${
    active ? "bg-tz-black text-tz-bone" : "bg-brand-card border border-brand-border text-brand-text-2 hover:bg-tz-bone"
  }`;
}

/**
 * E5-07: tira de días + chips de modalidad. Enlaces normales (no un
 * `useState` de cliente): la selección viaja en la URL, así que se puede
 * compartir o recargar la página con el mismo filtro puesto.
 */
export function AgendaFilterBar({
  days,
  modalities,
  selectedDay,
  selectedModality,
}: {
  days: AgendaDayOption[];
  /** Modalidades que de verdad tienen alguna sesión reservable para este socio. */
  modalities: AgendaModality[];
  selectedDay?: string;
  selectedModality?: AgendaModality;
}) {
  if (days.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5 tz-fade-up" style={{ animationDelay: "0.04s" }}>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Link href={hrefFor(undefined, selectedModality)} className={pillClass(!selectedDay)}>
          Todos los días
        </Link>
        {days.map((d) => (
          <Link key={d.value} href={hrefFor(d.value, selectedModality)} className={pillClass(selectedDay === d.value)}>
            {d.label}
          </Link>
        ))}
      </div>

      {modalities.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <Link href={hrefFor(selectedDay, undefined)} className={pillClass(!selectedModality)}>
            Todas las modalidades
          </Link>
          {MODALITIES.filter((m) => modalities.includes(m)).map((m) => (
            <Link key={m} href={hrefFor(selectedDay, m)} className={pillClass(selectedModality === m)}>
              {SERVICE_LABEL[m]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

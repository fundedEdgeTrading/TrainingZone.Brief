import { sessionServiceKind } from "@/lib/members-queries";

/**
 * E5-07: filtro por día y modalidad — hoy son 7 días en lista continua (42
 * tarjetas con 6 clases al día). Puro y testable a propósito: el estado vive
 * en la URL (`?dia=&modalidad=`), no en un `useState` de cliente, así que la
 * selección se puede compartir o recargar (paridad con la app, que ya tiene
 * tira de días y chips Personal/Grupo).
 */

export type AgendaModality = "GROUP" | "EP";

export type AgendaFilters = {
  day?: string;
  modality?: AgendaModality;
};

/** Los únicos valores de `?modalidad=` que se aceptan; cualquier otra cosa se ignora. */
export function parseModality(raw: string | undefined): AgendaModality | undefined {
  return raw === "GROUP" || raw === "EP" ? raw : undefined;
}

export function filterAgendaSessions<T extends { occurrenceDate: string; classType: string }>(
  sessions: T[],
  filters: AgendaFilters
): T[] {
  return sessions.filter((s) => {
    if (filters.day && s.occurrenceDate !== filters.day) return false;
    if (filters.modality && sessionServiceKind(s.classType) !== filters.modality) return false;
    return true;
  });
}

export type AgendaDayOption = { value: string; label: string };

/**
 * Días distintos presentes en la lista (ya filtrada por modalidad, no por
 * día: la tira de días tiene que seguir mostrando todos los días aunque uno
 * esté seleccionado, para poder cambiar de día sin pasar por "Todos").
 */
export function distinctAgendaDays<T extends { occurrenceDate: string; date: Date }>(sessions: T[]): AgendaDayOption[] {
  const byValue = new Map<string, Date>();
  for (const s of sessions) {
    if (!byValue.has(s.occurrenceDate)) byValue.set(s.occurrenceDate, s.date);
  }
  return [...byValue.entries()]
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([value, date]) => ({
      value,
      label: date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }),
    }));
}

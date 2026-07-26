export function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Serializa/parsea "YYYY-MM-DD" usando componentes locales (nunca UTC), para
// que el día no se desplace al cruzar la medianoche UTC en husos horarios
// adelantados (p.ej. Europa/Madrid).
export function formatDateParam(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateParam(s: string) {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export const DEFAULT_TIMEZONE = "Europe/Madrid";

/**
 * "Ahora" expresado como reloj de pared en `timeZone`, codificado como si esos
 * campos fuesen UTC. El servidor corre en UTC, así que el resto del código de
 * negocio (getHours, setHours(0,0,0,0), addDays...) lee getters locales que
 * en producción equivalen a getters UTC: con este valor, esos getters
 * devuelven la hora del navegador del cliente en vez de la hora real del
 * servidor.
 */
export function zonedNow(timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")));
  } catch {
    return new Date();
  }
}

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

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
 * Dos tipos de fecha conviven en la app y NO se pueden mezclar:
 *
 * 1. **Días sueltos** (`ClassSession.date`, `TimeClockEntry.workDate`,
 *    `recUntil`...). Se guardan a medianoche con componentes locales del
 *    servidor (ver `parseDateParam`) y la hora del día vive aparte, en campos
 *    "HH:MM" que son reloj de pared del centro. Para compararlos con "ahora"
 *    hace falta un "ahora" en la misma codificación: `zonedNow` / `zonedToday`.
 *
 * 2. **Instantes reales** (`createdAt`, `publishAt`, el momento en que empieza
 *    de verdad una clase). Aquí `Date.now()` es lo correcto; para pasar de
 *    día + "HH:MM" del centro a instante real está `zonedTimeToInstant`.
 *
 * El fallo que esto corrige: el servidor corre en UTC, así que un `new Date()`
 * comparado contra una hora de pared española iba dos horas por detrás (una en
 * invierno) y todos los "quedan X minutos" salían desplazados.
 */
function zonedParts(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // `hour12: false` devuelve 24 (no 0) para la medianoche en algunas versiones de ICU.
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * "Ahora" como reloj de pared de `timeZone`, codificado con componentes
 * *locales del servidor* — exactamente igual que `parseDateParam` y que los
 * `setHours` que usa el resto del código de negocio. Así `getHours()`,
 * `setHours(0,0,0,0)`, `toLocaleDateString()` y las comparaciones contra
 * `ClassSession.date` devuelven la hora del centro tanto si el servidor corre
 * en UTC (producción) como si corre en cualquier otra zona (desarrollo local).
 *
 * No es un instante real: no lo compares con `createdAt` ni con `Date.now()`.
 */
export function zonedNow(timeZone: string): Date {
  try {
    const p = zonedParts(timeZone, new Date());
    return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
  } catch {
    return new Date();
  }
}

/** Medianoche del día en curso en `timeZone`, en la misma codificación que `zonedNow`. */
export function zonedToday(timeZone: string): Date {
  const now = zonedNow(timeZone);
  now.setHours(0, 0, 0, 0);
  return now;
}

/** Minutos transcurridos del día en `timeZone` (0–1439), para comparar contra "HH:MM". */
export function zonedMinutesOfDay(timeZone: string): number {
  const now = zonedNow(timeZone);
  return now.getHours() * 60 + now.getMinutes();
}

/** Desfase de `timeZone` respecto a UTC en ese instante, en ms (positivo al este). */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const p = zonedParts(timeZone, instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Los desfases son siempre minutos enteros: redondear evita arrastrar los
  // milisegundos que `formatToParts` descarta.
  return Math.round((asUtc - instant.getTime()) / 60_000) * 60_000;
}

/**
 * Instante real en el que ocurre un reloj de pared del centro: el día `day`
 * (fecha suelta, medianoche local) a las `hhmm` de `timeZone`.
 *
 * Es lo que hay que usar para cualquier cuenta atrás ("faltan X minutos",
 * ventana de cancelación, antelación mínima) porque el resultado ya es un
 * instante absoluto: comparado con `Date.now()` sale bien mire desde donde
 * mire quien lo consulta.
 *
 * Doble pasada para los cambios de hora: la primera estimación usa el desfase
 * vigente en el instante equivocado, la segunda lo corrige.
 */
export function zonedTimeToInstant(day: Date, hhmm: string, timeZone: string): Date {
  const [hour, minute] = hhmm.split(":").map(Number);
  const wallAsUtc = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
  try {
    const firstPass = wallAsUtc - zoneOffsetMs(timeZone, new Date(wallAsUtc));
    return new Date(wallAsUtc - zoneOffsetMs(timeZone, new Date(firstPass)));
  } catch {
    const fallback = new Date(day);
    fallback.setHours(hour, minute, 0, 0);
    return fallback;
  }
}

/**
 * Suma meses de calendario recortando al último día del mes destino.
 *
 * La trampa del día 31 (F4): un socio de alta el 31 de enero no tiene
 * aniversario de mes en febrero. `setMonth` por sí solo desborda al 3 de marzo
 * — es decir, adelanta la valoración a otro mes — así que el recorte es
 * explícito: el hito cae el último día del mes que le toca (28/29 de febrero).
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months;
  // Día 0 del mes siguiente = último día del mes destino, ya normalizado el
  // desbordamiento de año que pueda traer `targetMonth`.
  const lastDayOfTarget = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
  const result = new Date(date);
  // Los tres componentes a la vez: en dos llamadas separadas el estado
  // intermedio volvería a desbordar.
  result.setFullYear(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDayOfTarget));
  return result;
}

/**
 * ¿Hoy es el cumpleaños del socio? (F5)
 *
 * `birthDate` es una fecha sin hora guardada a medianoche UTC (viene de un
 * `<input type="date">`, ver members/actions.ts), así que se lee con getters
 * UTC; `today` es el día de pared del centro (`zonedToday`), que sí usa
 * componentes locales. Mezclar convenciones aquí desplazaría el cumpleaños un
 * día en los servidores al oeste de Greenwich.
 *
 * **29 de febrero:** en años no bisiestos se felicita el 28. Sin esto, quien
 * nació ese día recibiría felicitación una vez cada cuatro años.
 */
export function isBirthdayOn(birthDate: Date, today: Date): boolean {
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();
  if (today.getMonth() === birthMonth && today.getDate() === birthDay) return true;
  if (birthMonth === 1 && birthDay === 29 && today.getMonth() === 1 && today.getDate() === 28) {
    return !isLeapYear(today.getFullYear());
  }
  return false;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}


/**
 * Fecha (y hora) de un INSTANTE real en el reloj de una zona concreta.
 *
 * `createdAt.toLocaleDateString("es-ES")` sin `timeZone` usa el reloj del
 * proceso, que en producción es UTC: entre las 22:00 y medianoche en España, un
 * registro creado "hoy" se listaba con la fecha de ayer — y en el registro de
 * auditoría eso no es un detalle estético. Se formatea a mano (dd/mm/aaaa) y no
 * con `toLocaleDateString`, porque el ICU de Node y el del navegador no dan la
 * misma cadena para es-ES y React marcaría discrepancia de hidratación.
 *
 * OJO: solo para instantes. Los "días sueltos" (`ClassSession.date`,
 * `workDate`, `birthDate`...) se guardan con componentes locales y NO llevan
 * zona — ver la nota larga de más arriba.
 */
function zonedDateParts(instant: Date, timeZone: string) {
  try {
    return zonedParts(timeZone, instant);
  } catch {
    return zonedParts(DEFAULT_TIMEZONE, instant);
  }
}

export function formatInstantDate(instant: Date, timeZone: string): string {
  const p = zonedDateParts(instant, timeZone);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}

export function formatInstantDateTime(instant: Date, timeZone: string): string {
  const p = zonedDateParts(instant, timeZone);
  const date = `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
  return `${date}, ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

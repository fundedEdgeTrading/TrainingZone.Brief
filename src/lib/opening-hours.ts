/**
 * Horario de apertura de un centro (E9-05).
 *
 * `Center.openingHours` es `Json?` porque el horario real de un centro no cabe
 * en una columna: hay días con dos franjas, días cerrados y sábados distintos
 * del resto. El esquema dejó la forma sin fijar; la fija este módulo, que es el
 * único sitio que la lee y la escribe.
 *
 * La forma es deliberadamente pobre: siete claves, y por cada una una lista de
 * franjas `"HH:MM-HH:MM"`. Sin festivos, sin horario de verano y sin excepciones
 * por fecha — eso es una agenda, no un rótulo, y el día que haga falta se
 * modela aparte en vez de estirar este JSON hasta que nadie lo entienda.
 *
 * Módulo puro: ni Prisma ni DOM. Lo comparten el formulario de dirección, la
 * ficha pública y el JSON-LD de E9-07.
 */

export const OPENING_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type OpeningDay = (typeof OPENING_DAYS)[number];

/** Franjas por día. Un día ausente o con lista vacía está cerrado. */
export type OpeningHours = Partial<Record<OpeningDay, string[]>>;

export const DAY_LABEL: Record<OpeningDay, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

/** Abreviaturas de schema.org, para el `openingHours` del JSON-LD (E9-07). */
const SCHEMA_DAY: Record<OpeningDay, string> = {
  mon: "Mo",
  tue: "Tu",
  wed: "We",
  thu: "Th",
  fri: "Fr",
  sat: "Sa",
  sun: "Su",
};

const RANGE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

export type ParseResult = { ok: true; value: OpeningHours | null } | { ok: false; error: string };

/**
 * Texto del formulario → JSON. Una línea por día:
 *
 *     Lunes: 07:00-14:00, 16:00-22:00
 *     Sábado: 09:00-14:00
 *     Domingo: cerrado
 *
 * Se reconoce el día por su nombre en español (con o sin tildes) o por su clave
 * de tres letras. Un texto vacío devuelve `null`, que es "no hay horario
 * cargado" y no "cerrado todos los días": la diferencia importa, porque un
 * centro sin horario no debe publicar un rótulo que diga que nunca abre.
 */
export function parseOpeningHours(raw: string): ParseResult {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };

  const value: OpeningHours = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf(":");
    if (separator === -1) return { ok: false, error: `No entiendo la línea «${trimmed}». Usa «Lunes: 07:00-22:00».` };

    const dayText = trimmed.slice(0, separator);
    const day = dayFromText(dayText);
    if (!day) return { ok: false, error: `«${dayText.trim()}» no es un día de la semana.` };
    if (value[day]) return { ok: false, error: `${DAY_LABEL[day]} aparece dos veces.` };

    const rest = trimmed.slice(separator + 1).trim();
    if (!rest || /^cerrad[oa]$/i.test(rest)) {
      value[day] = [];
      continue;
    }

    const ranges: string[] = [];
    for (const chunk of rest.split(",")) {
      const range = chunk.trim().replace(/\s*[–—]\s*/g, "-").replace(/\s*-\s*/g, "-");
      const match = RANGE.exec(range);
      if (!match) return { ok: false, error: `«${chunk.trim()}» no es una franja válida. Usa «07:00-22:00».` };
      if (range.slice(0, 5) >= range.slice(6)) {
        return { ok: false, error: `La franja «${range}» acaba antes de empezar.` };
      }
      ranges.push(range);
    }
    value[day] = ranges;
  }

  return { ok: true, value: Object.keys(value).length ? value : null };
}

/** JSON → texto del formulario. Lo inverso de `parseOpeningHours`. */
export function formatOpeningHours(hours: OpeningHours | null | undefined): string {
  if (!hours) return "";
  return OPENING_DAYS.filter((day) => hours[day] !== undefined)
    .map((day) => `${DAY_LABEL[day]}: ${(hours[day] ?? []).join(", ") || "cerrado"}`)
    .join("\n");
}

/** Filas para pintar el horario en la ficha pública, en orden de semana. */
export function openingHoursRows(hours: OpeningHours | null | undefined): { day: OpeningDay; label: string; value: string }[] {
  if (!hours) return [];
  return OPENING_DAYS.filter((day) => hours[day] !== undefined).map((day) => ({
    day,
    label: DAY_LABEL[day],
    value: (hours[day] ?? []).join(" · ") || "Cerrado",
  }));
}

/** `["Mo 07:00-14:00", …]` — el formato que espera `openingHours` de schema.org. */
export function toSchemaOpeningHours(hours: OpeningHours | null | undefined): string[] {
  if (!hours) return [];
  const out: string[] = [];
  for (const day of OPENING_DAYS) {
    for (const range of hours[day] ?? []) out.push(`${SCHEMA_DAY[day]} ${range}`);
  }
  return out;
}

/**
 * Lo que llega de Prisma es `JsonValue`: puede ser cualquier cosa, incluido lo
 * que escribiera una versión anterior de este módulo. Se valida antes de usarlo
 * en vez de confiar en un `as`.
 */
export function asOpeningHours(value: unknown): OpeningHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: OpeningHours = {};
  for (const day of OPENING_DAYS) {
    const ranges = (value as Record<string, unknown>)[day];
    if (ranges === undefined) continue;
    if (!Array.isArray(ranges)) return null;
    const valid = ranges.filter((r): r is string => typeof r === "string" && RANGE.test(r));
    if (valid.length !== ranges.length) return null;
    out[day] = valid;
  }
  return Object.keys(out).length ? out : null;
}

function dayFromText(raw: string): OpeningDay | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return null;
  for (const day of OPENING_DAYS) {
    if (day === normalized) return day;
    const label = DAY_LABEL[day]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (label === normalized) return day;
  }
  return null;
}

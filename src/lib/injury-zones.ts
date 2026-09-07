import type { InjuryZone, Laterality } from "@prisma/client";

/**
 * Catálogo cerrado de zonas de lesión y lateralidad (E3-02 · RB-SALUD-011).
 *
 * El emparejamiento entre `HealthRecord` y `AptitudeRule` se hacía por igualdad
 * de texto exacto entre dos campos libres: "hombro dcho.", "Hombro derecho" y
 * "hombro" eran tres zonas distintas, ninguna casaba con la regla y el semáforo
 * se quedaba en verde con la lesión delante. De las ocho zonas que podía marcar
 * la valoración inicial, solo dos encontraban regla.
 *
 * Aquí viven las tres piezas que lo arreglan y que tienen que ser UNA sola para
 * web, app y migración:
 *
 *  1. los rótulos del enum (`InjuryZone` / `Laterality`),
 *  2. el mapeo DECLARADO del texto libre heredado (`mapLegacyZone`), y
 *  3. la regla de emparejamiento zona + lado (`ruleMatchesRecord`).
 */

export const INJURY_ZONES: InjuryZone[] = [
  "CERVICALES",
  "DORSAL",
  "LUMBAR",
  "HOMBRO",
  "CODO",
  "MUNECA",
  "MANO",
  "CADERA",
  "INGLE",
  "CUADRICEPS",
  "ISQUIOSURALES",
  "RODILLA",
  "GEMELO",
  "TOBILLO",
  "PIE",
  "OTRA",
];

export const INJURY_ZONE_LABEL: Record<InjuryZone, string> = {
  CERVICALES: "Cervicales",
  DORSAL: "Dorsal / espalda alta",
  LUMBAR: "Zona lumbar",
  HOMBRO: "Hombro",
  CODO: "Codo",
  MUNECA: "Muñeca",
  MANO: "Mano",
  CADERA: "Cadera",
  INGLE: "Ingle / aductores",
  CUADRICEPS: "Cuádriceps",
  ISQUIOSURALES: "Isquiosurales",
  RODILLA: "Rodilla",
  GEMELO: "Gemelo / sóleo",
  TOBILLO: "Tobillo",
  PIE: "Pie",
  OTRA: "Otra zona",
};

export const LATERALITIES: Laterality[] = ["IZQUIERDA", "DERECHA", "BILATERAL", "NO_APLICA"];

export const LATERALITY_LABEL: Record<Laterality, string> = {
  IZQUIERDA: "Izquierdo",
  DERECHA: "Derecho",
  BILATERAL: "Bilateral",
  NO_APLICA: "No aplica",
};

/**
 * Zonas axiales: no tienen lado. Se guardan siempre con `NO_APLICA` para que la
 * ficha no ofrezca un desplegable que no significa nada, y para que una regla
 * lumbar no dependa de que alguien haya acertado con el lado.
 */
export const AXIAL_ZONES: InjuryZone[] = ["CERVICALES", "DORSAL", "LUMBAR", "OTRA"];

export function isAxialZone(zone: InjuryZone): boolean {
  return AXIAL_ZONES.includes(zone);
}

/** Lado con el que nace una zona cuando nadie lo ha declarado todavía. */
export function defaultSideFor(zone: InjuryZone): Laterality | null {
  return isAxialZone(zone) ? "NO_APLICA" : null;
}

/** "Hombro derecho", "Zona lumbar". Lo que se pinta; nunca lo que se compara. */
export function injuryZoneLabel(zone: InjuryZone | null, side: Laterality | null): string {
  if (!zone) return "Sin zona";
  const base = INJURY_ZONE_LABEL[zone];
  if (!side || side === "NO_APLICA") return base;
  if (side === "BILATERAL") return `${base} (bilateral)`;
  return `${base} ${LATERALITY_LABEL[side].toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Mapeo del texto libre heredado (escenario "migración de datos existentes")
// ---------------------------------------------------------------------------

/** Sin tildes, sin puntuación y en minúsculas: "Hombro Dcho." → "hombro dcho". */
export function normalizeZoneText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sinónimos declarados por zona. Se recorren de la clave MÁS LARGA a la más
 * corta, que es lo que evita que "espalda alta" caiga en "espalda" y acabe de
 * lumbar. Es una tabla, no una heurística: lo que no esté aquí no se adivina,
 * se marca para revisión manual.
 */
const ZONE_SYNONYMS: Record<InjuryZone, string[]> = {
  CERVICALES: ["cervicales", "cervical", "cuello", "trapecio superior"],
  DORSAL: ["espalda alta", "dorsal", "dorsales", "escapula", "escapular", "interescapular"],
  LUMBAR: ["zona lumbar", "lumbar", "lumbares", "lumbalgia", "espalda baja", "sacro", "sacroiliaca"],
  HOMBRO: ["hombro", "hombros", "deltoides", "manguito rotador", "manguito"],
  CODO: ["codo", "codos", "epicondilitis", "epitrocleitis"],
  MUNECA: ["muneca", "munecas", "carpo", "tunel carpiano"],
  MANO: ["mano", "manos", "dedo", "dedos", "pulgar"],
  CADERA: ["cadera", "caderas", "gluteo", "gluteos", "psoas", "trocanter"],
  INGLE: ["ingle", "aductor", "aductores", "pubis", "pubalgia"],
  CUADRICEPS: ["cuadriceps", "cuadricep", "muslo anterior", "recto femoral"],
  ISQUIOSURALES: ["isquiosurales", "isquiotibiales", "isquiotibial", "isquios", "isquio", "biceps femoral"],
  RODILLA: ["rodilla", "rodillas", "menisco", "rotula", "patela", "condropatia", "ligamento cruzado"],
  GEMELO: ["gemelo", "gemelos", "soleo", "pantorrilla", "aquiles", "tendon de aquiles"],
  TOBILLO: ["tobillo", "tobillos", "peroneo", "peroneos"],
  PIE: ["pie", "pies", "planta del pie", "fascitis", "fascitis plantar", "metatarso", "juanete"],
  OTRA: ["otra zona", "otra", "otras", "sin localizar", "generalizado"],
};

const SIDE_SYNONYMS: [Laterality, string[]][] = [
  ["BILATERAL", ["bilateral", "ambos", "ambas", "los dos", "las dos", "derecho e izquierdo"]],
  ["DERECHA", ["derecho", "derecha", "dcho", "dcha", "der", "drcho", "drcha"]],
  ["IZQUIERDA", ["izquierdo", "izquierda", "izq", "izqdo", "izda", "izdo", "i zq"]],
];

/** Índice zona → sinónimos, ordenado por longitud descendente. Se calcula una vez. */
const ZONE_INDEX: [string, InjuryZone][] = Object.entries(ZONE_SYNONYMS)
  .flatMap(([zone, words]) => words.map((w) => [w, zone as InjuryZone] as [string, InjuryZone]))
  .sort((a, b) => b[0].length - a[0].length);

/** ¿Aparece `needle` como palabra(s) completa(s) dentro de `haystack`? */
function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(^|\\s)${needle}(\\s|$)`).test(haystack);
}

/** `side: null` = zona con lado pero sin lado escrito en el texto original. */
export type LegacyZoneMapping = { zone: InjuryZone; side: Laterality | null };

/**
 * Traduce una zona de texto libre al par (zona, lado) del catálogo cerrado.
 * Devuelve `null` cuando el texto no está en el mapeo declarado: esas filas NO
 * se descartan ni se adivinan — se quedan como están y la migración las cuenta
 * y las marca para revisión manual.
 */
export function mapLegacyZone(raw: string | null | undefined): LegacyZoneMapping | null {
  if (!raw) return null;
  const text = normalizeZoneText(raw);
  if (!text) return null;

  const zone = ZONE_INDEX.find(([word]) => containsWord(text, word))?.[1];
  if (!zone) return null;

  if (isAxialZone(zone)) return { zone, side: "NO_APLICA" };

  // Zona con lado pero sin lado escrito ("hombro" a secas): el lado se queda sin
  // declarar en vez de inventarse. `null` significa "no consta", que es
  // exactamente lo que el registro dice, y el emparejamiento lo trata como tal.
  const side = SIDE_SYNONYMS.find(([, words]) => words.some((w) => containsWord(text, w)))?.[0] ?? null;
  return { zone, side };
}

// ---------------------------------------------------------------------------
// Emparejamiento regla ↔ registro (escenarios "regla sin lado" / "regla con lado")
// ---------------------------------------------------------------------------

export type ZonedRule = { zoneCode: InjuryZone | null; side: Laterality | null };
export type ZonedRecord = { zoneCode: InjuryZone | null; side: Laterality | null };

/**
 * Una regla de aptitud casa con un registro de salud cuando hablan de la misma
 * ZONA y el lado no las separa.
 *
 * · Regla sin lado (el caso normal): vale para los dos lados. Una limitación de
 *   hombro lo es del hombro lesionado, no del derecho.
 * · Regla con lado: solo casa con ese lado — o con `BILATERAL`, que incluye los
 *   dos.
 * · Registro sin lado declarado: la regla lateralizada SÍ casa. En un semáforo de
 *   salud, perder un aviso por un dato que nadie rellenó es peor que darlo de
 *   más; el aviso se ve y se corrige, el silencio no.
 */
export function ruleMatchesRecord(rule: ZonedRule, record: ZonedRecord): boolean {
  if (!rule.zoneCode || !record.zoneCode) return false;
  if (rule.zoneCode !== record.zoneCode) return false;
  if (!rule.side || rule.side === "NO_APLICA") return true;
  if (!record.side || record.side === "BILATERAL" || record.side === "NO_APLICA") return true;
  return rule.side === record.side;
}

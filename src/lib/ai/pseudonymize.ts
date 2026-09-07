/**
 * Filtro de identificadores sobre el texto libre que sale hacia la IA
 * (E3-15 · RB-IA-004).
 *
 * La pantalla de mesociclos promete literalmente *"La IA recibe… Nunca nombre,
 * DNI, teléfono ni email"* y **no había ningún filtro**: viajaban sin tocar
 * `HealthRecord.description`, `cierre.notasEntrenador`, `screening.lesionesActuales`,
 * `screening.medicacion`, `screening.cirugias`, `perfil.motivacionReal` y
 * `ClientGoal.label`. Basta que un entrenador escriba *"María se queja del
 * hombro desde que su hijo Pablo nació"*.
 *
 * El riesgo no es la salida en sí —Anthropic es encargado y el trayecto está
 * auditado— sino prometer una garantía técnica que no se aplica: eso convierte
 * un tratamiento defendible en uno desleal. Se toma la **vía 1** de la historia
 * (filtrar), no la vía 2 (reescribir el texto de la pantalla y re-consentir).
 *
 * Qué NO es esto: un anonimizador perfecto. Un nombre poco común escrito sin
 * pista alguna puede pasar, y por eso la pantalla dice —y tiene que seguir
 * diciendo— que el filtro es automático y no sustituye al criterio de quien
 * escribe.
 */

export const IDENTIFIER_MARKERS = {
  name: "[NOMBRE]",
  id: "[DNI]",
  phone: "[TELÉFONO]",
  email: "[EMAIL]",
} as const;

/** Email. Va primero: contiene puntos y dígitos que confundirían al resto. */
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi;

/** DNI (8 dígitos + letra) y NIE (X/Y/Z + 7 dígitos + letra), con o sin guion. */
const DNI_RE = /\b(?:[XYZ][-\s]?)?\d{7,8}[-\s]?[A-Z]\b/gi;

/**
 * Teléfono español, fijo o móvil, con o sin prefijo y con los separadores que
 * la gente usa de verdad. No se persiguen números sueltos: "8 repeticiones" no
 * es un teléfono.
 */
const PHONE_RE = /(?:\+34|0034)?[\s-]?[6-9]\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g;

/**
 * Nombres de pila frecuentes en España. No pretende ser el censo: cubre lo que
 * de verdad aparece escrito en una nota de sala ("María se queja…"), que es el
 * caso de la historia.
 */
const GIVEN_NAMES = [
  "adrian", "africa", "agustin", "aitana", "alba", "alberto", "alejandra", "alejandro", "alex", "alfonso",
  "alicia", "alvaro", "amparo", "ana", "andrea", "andres", "angel", "angela", "angeles", "antonio",
  "araceli", "arantxa", "ariadna", "arturo", "asuncion", "aurora", "beatriz", "belen", "benito", "bernardo",
  "blanca", "borja", "bruno", "candela", "carla", "carlos", "carmen", "carolina", "cesar", "claudia",
  "clara", "concepcion", "consuelo", "cristina", "cristian", "daniel", "daniela", "david", "diego", "dolores",
  "elena", "elisa", "eloy", "elvira", "emilio", "encarna", "enrique", "eric", "ernesto", "esperanza",
  "esteban", "estela", "esther", "eugenia", "eva", "fatima", "felipe", "fernando", "francisco", "gabriel",
  "gema", "gerardo", "gloria", "gonzalo", "gregorio", "guillermo", "gustavo", "hector", "helena", "hugo",
  "ignacio", "ines", "irene", "iris", "isabel", "ismael", "israel", "ivan", "jaime", "javier",
  "jesus", "joaquin", "jorge", "jose", "josefa", "juan", "juana", "julia", "julian", "julio",
  "lara", "laura", "laia", "leire", "leo", "leonor", "lidia", "lorena", "lucas", "lucia",
  "luis", "luisa", "manuel", "manuela", "mar", "marc", "marcos", "margarita", "maria", "mariano",
  "marina", "mario", "marta", "martin", "mateo", "matias", "mercedes", "miguel", "milagros", "monica",
  "montserrat", "natalia", "nerea", "nicolas", "noelia", "nuria", "olga", "oscar", "pablo", "paloma",
  "paula", "pedro", "pilar", "rafael", "ramon", "raquel", "raul", "rebeca", "ricardo", "rocio",
  "rodrigo", "roberto", "rosa", "rosario", "ruben", "ruth", "salvador", "samuel", "sandra", "santiago",
  "sara", "sergio", "silvia", "sofia", "sonia", "susana", "teresa", "tomas", "valeria", "vanesa",
  "vega", "vicente", "victor", "victoria", "violeta", "virginia", "yolanda", "zaira",
];

/**
 * Palabras que introducen un nombre propio aunque no esté en la lista: "su hijo
 * Pablo", "el fisio Ander". Es lo que salva a los nombres poco frecuentes.
 */
const NAME_CUES = [
  "hijo", "hija", "hijos", "hijas", "marido", "mujer", "esposo", "esposa", "pareja", "novio", "novia",
  "madre", "padre", "hermano", "hermana", "abuelo", "abuela", "primo", "prima", "sobrino", "sobrina",
  "amigo", "amiga", "vecino", "vecina", "jefe", "jefa", "compañero", "compañera",
  "fisio", "fisioterapeuta", "doctor", "doctora", "medico", "traumatologo", "entrenador", "entrenadora",
  "llamado", "llamada", "se llama", "sr", "sra", "don", "doña",
];

function sinTildes(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const GIVEN_NAME_SET = new Set(GIVEN_NAMES);

/** `\b` no basta con acentos, así que el límite se declara a mano. */
const WORD_EDGE = "(?<![\\p{L}\\p{N}])";
const WORD_END = "(?![\\p{L}\\p{N}])";

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ScrubOptions = {
  /**
   * Nombres que el sistema YA conoce (el del propio socio, el del lead...).
   * Se sustituyen aunque no estén en la lista de nombres frecuentes: son los
   * que con más probabilidad aparecen escritos en sus propias notas.
   */
  knownNames?: string[];
};

/**
 * Sustituye por marcadores los identificadores directos de un texto libre.
 * Idempotente: pasar dos veces el mismo texto no cambia el resultado, porque
 * los marcadores no casan con ninguno de los patrones.
 */
export function scrubIdentifiers(text: string, options: ScrubOptions = {}): string {
  if (!text) return text;

  let out = text.replace(EMAIL_RE, IDENTIFIER_MARKERS.email);
  out = out.replace(DNI_RE, IDENTIFIER_MARKERS.id);
  out = out.replace(PHONE_RE, IDENTIFIER_MARKERS.phone);

  // 1. Los nombres que el sistema conoce, tal cual están escritos.
  for (const known of options.knownNames ?? []) {
    for (const part of known.split(/\s+/)) {
      if (part.length < 3) continue; // "de", "la": partículas de apellido
      out = out.replace(
        new RegExp(`${WORD_EDGE}${escapeRe(part)}${WORD_END}`, "giu"),
        IDENTIFIER_MARKERS.name
      );
    }
  }

  // 2. Nombre propio detrás de una pista de parentesco u oficio, esté o no en
  //    la lista: "su hijo Pablo", "el fisio Ander".
  const cues = NAME_CUES.map(escapeRe).join("|");
  out = out.replace(
    new RegExp(`${WORD_EDGE}(${cues})(\\s+)(\\p{Lu}\\p{L}+)${WORD_END}`, "giu"),
    (_match, cue: string, space: string) => `${cue}${space}${IDENTIFIER_MARKERS.name}`
  );

  // 3. Nombres de pila frecuentes. Se exige mayúscula inicial a propósito:
  //    "Rosa se queja del hombro" es una persona, "la piel está rosa" no, y sin
  //    esa distinción el filtro se comería media nota clínica. En español una
  //    palabra capitalizada dentro de la frase es casi siempre un nombre propio.
  out = out.replace(new RegExp(`${WORD_EDGE}\\p{Lu}\\p{L}{2,}${WORD_END}`, "gu"), (word) =>
    GIVEN_NAME_SET.has(sinTildes(word).toLowerCase()) ? IDENTIFIER_MARKERS.name : word
  );

  return out;
}

/** Aplica el filtro a una lista de textos libres, conservando el orden. */
export function scrubAll(values: string[], options: ScrubOptions = {}): string[] {
  return values.map((v) => scrubIdentifiers(v, options));
}

/** ¿Este texto todavía contiene algo que el filtro habría cambiado? Para tests y avisos. */
export function containsIdentifiers(text: string, options: ScrubOptions = {}): boolean {
  return scrubIdentifiers(text, options) !== text;
}

/**
 * Texto de la interfaz. Va aquí, junto al filtro, para que la promesa de la
 * pantalla y lo que el código hace de verdad no se puedan separar otra vez.
 */
export const PSEUDONYMIZATION_NOTICE =
  "El filtro de identificadores es automático: antes de salir se sustituyen nombres, DNI, " +
  "teléfonos y correos por marcadores. No sustituye a tu criterio — escribe la nota clínica " +
  "sin datos que no hagan falta.";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EpProfile } from "@/lib/ai/ep-profile";

/**
 * Carga y ensambla la metodología del agente "Entrenamiento Personal —
 * Training Zone" trocead en ficheros `.md` bajo `./methodology/`. Un fichero
 * por sección permite revisar el diff de una regla sin ruido y que la parte
 * estable del sistema siga cacheándose (`cache_control`): se concatena
 * siempre en el mismo orden con el mismo contenido, y el perfil es la única
 * pieza que cambia entre llamadas (ver docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md §2).
 *
 * Los valores de perfil viven en `ep-profile.ts` (sin `node:fs`, importable
 * también desde el cliente); este módulo es server-only por los `readFileSync`.
 */
export { EP_PROFILES, EP_PROFILE_LABEL, DEFAULT_PROFILE, type EpProfile } from "@/lib/ai/ep-profile";

const ROOT = join(process.cwd(), "src/lib/ai/methodology");
const read = (name: string) => readFileSync(join(ROOT, name), "utf8").trim();

/** Debe coincidir con el contenido de `methodology/VERSION`. */
export const METHODOLOGY_VERSION = read("VERSION");

const SHARED_FILES = [
  "00-rol-y-principios.md",
  "01-regla-de-oro.md",
  "02-glosario.md",
  "03-reglas-cientificas.md",
  "04-reglas-programacion.md",
  "05-formato-sesion.md",
  "06-porques.md",
];

const SHARED = SHARED_FILES.map(read).join("\n\n---\n\n");

const PROFILE_FILE: Record<EpProfile, string> = {
  TERCERA_EDAD: "perfiles/tercera-edad.md",
  REHABILITACION: "perfiles/rehabilitacion.md",
  DERIVACION_GRUPOS: "perfiles/derivacion-grupos.md",
  RENDIMIENTO_OPOSICIONES: "perfiles/rendimiento.md",
  RENDIMIENTO_ATLETA: "perfiles/rendimiento.md",
  MANTENIMIENTO: "perfiles/mantenimiento.md",
};

/**
 * Contrato de salida sobre el esquema ACTUAL (`mesocycle-schema.ts`), que ya
 * tiene un campo `profile` (eco del perfil con el que se programa) pero
 * todavía no tiene campos propios para supuestos, preguntas pendientes, "lo
 * único que hay que vigilar" o la clave de ejecución (fase 1 de la guía, sin
 * terminar). Hasta entonces, esas piezas de la metodología se aplican dentro
 * de los campos existentes.
 */
const OUTPUT_CONTRACT = `## Formato de salida

Devuelves únicamente el plan en el formato estructurado que se te indica
(Mesocycle → Phase → Day → Block → Exercise). Sin introducciones, sin
resúmenes, sin markdown y sin comentarios fuera de los campos. Todo el texto
en español de España. El campo \`profile\` repite exactamente el perfil
Training Zone con el que se te ha pedido programar: no lo cambies aunque el
contenido del plan te parezca más propio de otro grupo.

El esquema actual todavía no tiene campos propios para "supuestos",
"preguntas pendientes", "lo único que hay que vigilar" ni la clave de
ejecución corta. Aplica esas reglas dentro de los campos existentes:

- Cada \`name\` de ejercicio lleva su adaptación específica para este socio,
  nunca el nombre de catálogo a secas ("ejercicio pelado").
- \`description\` incluye, si aplica, lo único que hay que vigilar de ese
  ejercicio para este socio (una frase, al principio).
- \`rationale\` es obligatorio y explica el porqué de este ejercicio para
  este socio; si el screening condiciona la elección (agarre, rango, apoyo,
  progresión), se dice ahí explícitamente.
- Si falta un dato que condiciona una decisión de programación, no lo
  asumas en silencio: toma la opción más conservadora y añade una entrada en
  \`safetyCriteria\` con el prefijo exacto \`[SUPUESTO — confirmar]\`
  describiendo qué falta y qué se ha asumido mientras tanto.`;

/**
 * Sistema completo para un perfil. Es determinista: mismo perfil → mismos
 * bytes → mismo prefijo de caché. Nada del socio ni fecha alguna entra aquí.
 */
export function buildMethodologySystem(profile: EpProfile): string {
  return `${SHARED}\n\n---\n\n${read(PROFILE_FILE[profile])}\n\n---\n\n${OUTPUT_CONTRACT}`;
}

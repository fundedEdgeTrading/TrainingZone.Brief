/**
 * Los 6 valores de perfil Training Zone (docs/GUIA_AGENTE_GENERADOR_ENTRENAMIENTOS.md
 * §2, §5). Fichero sin dependencias de Node aparte: lo importan tanto
 * `methodology.ts` y `mesocycle-schema.ts` (servidor) como el selector del
 * asistente de generación (cliente), y un módulo con `node:fs` no se puede
 * traer al bundle del cliente.
 */
export const EP_PROFILES = [
  "TERCERA_EDAD",
  "REHABILITACION",
  "DERIVACION_GRUPOS",
  "RENDIMIENTO_OPOSICIONES",
  "RENDIMIENTO_ATLETA",
  "MANTENIMIENTO",
] as const;

export type EpProfile = (typeof EP_PROFILES)[number];

/** Etiqueta corta para el selector de perfil del asistente de generación. */
export const EP_PROFILE_LABEL: Record<EpProfile, string> = {
  TERCERA_EDAD: "Tercera edad",
  REHABILITACION: "Rehabilitación",
  DERIVACION_GRUPOS: "Derivación a grupos",
  RENDIMIENTO_OPOSICIONES: "Rendimiento · oposición",
  RENDIMIENTO_ATLETA: "Rendimiento · atleta",
  MANTENIMIENTO: "Mantenimiento",
};

/**
 * Perfil de respaldo: el que trae el selector del asistente si el entrenador
 * no ha elegido ninguno todavía, y el que llevan los mesociclos generados
 * antes de que existiera el campo `profile` (`Mesocycle.profile` nace con
 * este mismo valor por defecto en la migración, así que el histórico no
 * cambia de metodología al leerse).
 */
export const DEFAULT_PROFILE: EpProfile = "MANTENIMIENTO";

export function isEpProfile(value: string): value is EpProfile {
  return (EP_PROFILES as readonly string[]).includes(value);
}

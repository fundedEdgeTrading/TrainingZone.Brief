// F-ALTA: lo que la app le exige al socio la primera vez que entra.
//
// Nace de la importación por CSV (RB-IMPORT). Un export de otra plataforma trae
// lo justo para identificar a la persona —nombre, apellidos, email— y deja
// vacío casi todo lo demás: en el export de referencia, dirección, ciudad, CP y
// provincia vienen en blanco en prácticamente todas las filas, y el teléfono
// solo aparece en la columna «Móvil». Dirección no puede inventarse esos datos,
// pero la app los necesita: el CP es lo que alimenta el mapa de calor por
// barrios del cuadro de mando (`getPostalCodeMapData`), y sin fecha de
// nacimiento no hay edad ni rangos de referencia.
//
// De ahí el muro: en vez de perseguir al socio por email, se le piden la
// primera vez que entra, cuando ya está delante de la pantalla.
//
// Este módulo es la mitad PURA (misma separación que `email-preferences.ts`
// frente a `email-preferences-queries.ts`): lo importa el formulario del muro,
// que es un componente de cliente, y una sola importación de `prisma` aquí
// arrastraría el driver de Postgres al bundle del navegador. Lo que consulta
// la base vive en `member-first-session-queries.ts`.

/**
 * Los datos sin los cuales el socio no pasa de la puerta.
 *
 * El listado es corto a propósito: cada campo de más es una excusa para
 * abandonar el alta, así que solo entra lo que se usa para algo concreto. Queda
 * fuera «Dirección 2» (piso y puerta no se grafican) y también el país, que en
 * un centro español es siempre el mismo y no distingue a nadie. Ambos siguen
 * siendo editables luego en el perfil.
 */
export const ESSENTIAL_PROFILE_FIELDS = [
  { key: "birthDate", label: "Fecha de nacimiento", why: "edad y rangos de referencia" },
  { key: "phone", label: "Teléfono", why: "avisos de plaza y contacto del centro" },
  { key: "postalCode", label: "Código postal", why: "mapa de socios por barrio" },
  { key: "address", label: "Dirección", why: "domicilio de contacto" },
  { key: "city", label: "Ciudad", why: "domicilio de contacto" },
  { key: "province", label: "Provincia", why: "domicilio de contacto" },
  { key: "emergencyContact", label: "Contacto de emergencia", why: "seguridad durante el entrenamiento" },
] as const;

export type EssentialProfileField = (typeof ESSENTIAL_PROFILE_FIELDS)[number]["key"];

/** Lo mínimo que hay que leer de un socio para saber si le falta algo. */
export type EssentialProfileSource = Record<EssentialProfileField, unknown>;

export const ESSENTIAL_PROFILE_SELECT = Object.fromEntries(
  ESSENTIAL_PROFILE_FIELDS.map((f) => [f.key, true])
) as Record<EssentialProfileField, true>;

/**
 * Campos esenciales que este socio todavía no tiene. Una cadena en blanco
 * cuenta como ausente: la importación escribe `""` en el email cuando el CSV no
 * lo trae, y un dato en blanco no es un dato.
 */
export function missingEssentialProfileFields(member: EssentialProfileSource): EssentialProfileField[] {
  return ESSENTIAL_PROFILE_FIELDS.filter((f) => {
    const value = member[f.key];
    if (value == null) return true;
    return typeof value === "string" && value.trim() === "";
  }).map((f) => f.key);
}

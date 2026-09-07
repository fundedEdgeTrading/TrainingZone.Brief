// F-ALTA: lo que la app le exige al socio la primera vez que entra.
//
// E5-08 reescribe esta lista: el muro pedía nacimiento, teléfono, CP,
// dirección, ciudad, provincia y contacto de emergencia — siete campos y
// después la valoración inicial entera — con el CP ahí solo porque alimenta
// el mapa de calor por barrios del cuadro de mando, no porque haga falta para
// entrenar. Bloquear la reserva para alimentar un panel de dirección era el
// problema. Ahora solo bloquea lo que el SERVICIO necesita de verdad para la
// primera sesión: edad, contacto de emergencia y una declaración de salud
// mínima (E10-03). El resto (`SECONDARY_PROFILE_FIELDS`) se pide después,
// desde el perfil, con un aviso no bloqueante — y el teléfono, si ya se dio en
// el checkout, ni se vuelve a pedir.
//
// Este módulo es la mitad PURA (misma separación que `email-preferences.ts`
// frente a `email-preferences-queries.ts`): lo importa el formulario del muro,
// que es un componente de cliente, y una sola importación de `prisma` aquí
// arrastraría el driver de Postgres al bundle del navegador. Lo que consulta
// la base vive en `member-first-session-queries.ts`.

/**
 * Los datos sin los cuales el socio no pasa de la puerta: solo lo que hace
 * falta para entrenar con seguridad, nada de lo que alimenta un panel.
 */
export const ESSENTIAL_PROFILE_FIELDS = [
  { key: "birthDate", label: "Fecha de nacimiento", why: "edad y rangos de referencia" },
  { key: "emergencyContact", label: "Contacto de emergencia", why: "seguridad durante el entrenamiento" },
] as const;

export type EssentialProfileField = (typeof ESSENTIAL_PROFILE_FIELDS)[number]["key"];

/** Lo mínimo que hay que leer de un socio para saber si le falta algo. */
export type EssentialProfileSource = Record<EssentialProfileField, unknown>;

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

/**
 * Lo que ya NO bloquea la reserva: se pide desde `/portal/perfil`, con un
 * aviso no bloqueante en el portal mientras falte. El teléfono está aquí a
 * propósito — si el checkout ya lo recogió, `missingSecondaryProfileFields`
 * no lo cuenta como pendiente y no se vuelve a pedir.
 */
export const SECONDARY_PROFILE_FIELDS = [
  { key: "phone", label: "Teléfono" },
  { key: "postalCode", label: "Código postal" },
  { key: "address", label: "Dirección" },
  { key: "city", label: "Ciudad" },
  { key: "province", label: "Provincia" },
] as const;

export type SecondaryProfileField = (typeof SECONDARY_PROFILE_FIELDS)[number]["key"];
export type SecondaryProfileSource = Record<SecondaryProfileField, unknown>;

export function missingSecondaryProfileFields(member: SecondaryProfileSource): SecondaryProfileField[] {
  return SECONDARY_PROFILE_FIELDS.filter((f) => {
    const value = member[f.key];
    if (value == null) return true;
    return typeof value === "string" && value.trim() === "";
  }).map((f) => f.key);
}

/**
 * Declaración de salud mínima (E10-03): sin ella no hay base legal (Art. 9
 * RGPD) para adaptar la sesión a lo que el socio traiga. `consentHealth` es
 * el marcador de que ya la hizo — la escribe `createSelfDeclaredHealthRecord`
 * (health-access.ts) junto con el `HealthRecord` correspondiente, "ninguna"
 * incluido, mismo patrón que `createHealthRecordForLead`.
 */
export function needsHealthDeclaration(member: { consentHealth: boolean }): boolean {
  return !member.consentHealth;
}

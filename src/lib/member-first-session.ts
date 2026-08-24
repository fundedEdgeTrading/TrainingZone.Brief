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

import { prisma } from "@/lib/prisma";
import { dueDateForKind } from "@/lib/assessments/queries";

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

/**
 * Abre la valoración inicial del socio si todavía no tiene ninguna.
 *
 * Se llama al terminar el onboarding y no desde el muro: crear registros
 * mientras se pinta una pantalla convierte cualquier recarga en una fila nueva.
 * Reutiliza cualquier valoración inicial que ya exista —abierta o cerrada—
 * porque el entrenador pudo hacerla en el centro antes de que el socio llegara
 * a activar su cuenta, y en ese caso no hay nada que volver a preguntar.
 */
export async function ensureInitialAssessment(
  orgId: string,
  memberId: string,
  joinedAt: Date
): Promise<string | null> {
  const existing = await prisma.assessment.findFirst({
    where: { orgId, memberId, kind: "INITIAL" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.assessment.create({
    data: { orgId, memberId, kind: "INITIAL", dueDate: dueDateForKind(joinedAt, "INITIAL"), answers: {} },
    select: { id: true },
  });
  return created.id;
}

export type FirstSessionStep =
  | { step: "profile"; missing: EssentialProfileField[] }
  | { step: "assessment" };

/**
 * Qué le queda al socio antes de poder usar el portal, en orden: primero sus
 * datos y después su parte de la valoración inicial. Null cuando ya no debe
 * nada y el portal se abre con normalidad.
 *
 * Solo mira valoraciones **abiertas**: una ya cerrada se rellenó entera del
 * lado del entrenador —la única vía que existía hasta F-ALTA— y volver a
 * pedírsela al socio sería preguntarle por algo que ya contestó.
 */
export async function resolveFirstSessionStep(
  member: EssentialProfileSource & { id: string }
): Promise<FirstSessionStep | null> {
  const missing = missingEssentialProfileFields(member);
  if (missing.length) return { step: "profile", missing };

  const pending = await prisma.assessment.findFirst({
    where: { memberId: member.id, kind: "INITIAL", completedAt: null, memberPartAt: null },
    select: { id: true },
  });
  return pending ? { step: "assessment" } : null;
}

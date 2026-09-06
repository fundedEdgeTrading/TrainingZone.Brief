import { planServiceKind } from "@/lib/session-balance";

/**
 * RB-SEG-003 (E1-05): quién puede ocupar plaza en una sesión, como decisión
 * pura y en un solo sitio.
 *
 * El selector "Socio" de la agenda ofrecía `listActiveMembersForSelect(orgId)`
 * —la organización entera— mientras la escritura solo comprobaba que el socio
 * fuera de la organización. Verificado: un entrenador imputado a dos centros
 * recibía los 49 socios de la organización, los 34 de un tercer centro
 * incluidos, y reservarles plaza funcionaba.
 *
 * El criterio correcto ya existía justo al lado (`listMembersBookableForSession`,
 * y el mismo que aplica `pickBookingSubscription` al cobrar): bono ACTIVE de
 * esa modalidad en el centro que imparte la sesión. Aquí vive sin Prisma para
 * que el listado y la validación de escritura no puedan divergir — que es
 * exactamente cómo divergieron.
 */

export type ScopedSubscription = { plan: { type: string } };

/**
 * ¿Alguno de estos bonos —ya filtrados por `status: ACTIVE` y por el centro de
 * la sesión— cubre esta modalidad?
 */
export function coversSessionKind(subscriptions: ScopedSubscription[], kind: "EP" | "GROUP" | null): boolean {
  return subscriptions.some((s) => planServiceKind(s.plan.type) === kind);
}

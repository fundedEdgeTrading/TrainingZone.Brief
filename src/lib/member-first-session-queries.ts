// F-ALTA: la mitad de `member-first-session.ts` que habla con la base de datos.
// Separada a propósito: el formulario del muro es un componente de cliente e
// importa las constantes de allí, así que aquel módulo no puede tocar `prisma`
// sin arrastrar el driver de Postgres al navegador.

import { prisma } from "@/lib/prisma";
import { dueDateForKind } from "@/lib/assessments/queries";
import {
  missingEssentialProfileFields,
  type EssentialProfileField,
  type EssentialProfileSource,
} from "./member-first-session";

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

// F-ALTA: la mitad de `member-first-session.ts` que habla con la base de datos.
// Separada a propósito: el formulario del muro es un componente de cliente e
// importa las constantes de allí, así que aquel módulo no puede tocar `prisma`
// sin arrastrar el driver de Postgres al navegador.

import { prisma } from "@/lib/prisma";
import { dueDateForKind } from "@/lib/assessments/queries";
import {
  missingEssentialProfileFields,
  needsHealthDeclaration,
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

export type FirstSessionStep = {
  step: "profile";
  missing: EssentialProfileField[];
  needsHealthDeclaration: boolean;
};

/**
 * Qué le queda al socio antes de poder usar el portal. Null cuando ya no debe
 * nada y el portal se abre con normalidad.
 *
 * E5-08: la valoración inicial YA NO bloquea aquí — se pospone (F4 §5.3,
 * `PendingAssessmentGate` en `portal/layout.tsx`, que ya sabe pedirla con
 * salida) en vez de encerrar al socio detrás de un muro sin escape. Lo único
 * que sigue bloqueando es lo que el servicio necesita de verdad para la
 * primera sesión: edad, contacto de emergencia y la declaración de salud.
 */
export async function resolveFirstSessionStep(
  member: EssentialProfileSource & { id: string; consentHealth: boolean }
): Promise<FirstSessionStep | null> {
  const missing = missingEssentialProfileFields(member);
  const missingHealthDeclaration = needsHealthDeclaration(member);
  if (missing.length || missingHealthDeclaration) {
    return { step: "profile", missing, needsHealthDeclaration: missingHealthDeclaration };
  }
  return null;
}

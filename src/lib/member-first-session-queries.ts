// F-ALTA: la mitad de `member-first-session.ts` que habla con la base de datos.
// Separada a propósito: el formulario del muro es un componente de cliente e
// importa las constantes de allí, así que aquel módulo no puede tocar `prisma`
// sin arrastrar el driver de Postgres al navegador.

import type { Prisma, PrismaClient } from "@prisma/client";
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
  joinedAt: Date,
  db: PrismaClient = prisma
): Promise<string | null> {
  // QA-ALTA-14: buscar y crear por separado dejaba pasar dos INITIAL cuando
  // el onboarding y el cron (o un reintento) llegaban a la vez: los dos
  // miraban, ninguno encontraba y los dos creaban. El esquema está congelado,
  // así que no hay índice único que lo impida; lo impide este cerrojo, que
  // pone en fila a quien vaya a abrir una valoración de ESTE socio.
  return db.$transaction(async (tx) => {
    await lockMemberAssessments(tx, memberId);
    const existing = await tx.assessment.findFirst({
      where: { orgId, memberId, kind: "INITIAL" },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.assessment.create({
      data: { orgId, memberId, kind: "INITIAL", dueDate: dueDateForKind(joinedAt, "INITIAL"), answers: {} },
      select: { id: true },
    });
    return created.id;
  });
}

/**
 * Cerrojo de transacción por socio para abrir valoraciones
 * (`pg_advisory_xact_lock`): se suelta solo al terminar la transacción, así
 * que no hay forma de dejarlo cogido. Sirve si TODO el que crea una valoración
 * lo toma antes de mirar si ya existe; el espacio de claves va prefijado para
 * no chocar con otros cerrojos consultivos por id.
 */
export async function lockMemberAssessments(tx: Prisma.TransactionClient, memberId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assessment:${memberId}`}, 0))`;
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

import { prisma } from "@/lib/prisma";

import { AI_LITERACY_ACTION, AI_LITERACY_ENTITY, AI_LITERACY_VERSION } from "@/lib/ai/ai-act";

/**
 * E10-17 · Art. 4 del Reglamento de IA: constancia de la formación en
 * alfabetización en IA de quien opera el sistema.
 *
 * Aplicable desde el 2/2/2025 y alcanza al responsable del despliegue, no solo
 * al proveedor: el entrenador que pulsa "Generar" está operando un sistema de
 * IA. "Queda constancia" no es un cartel: es un registro con nombre, fecha y
 * versión del contenido, y por eso vive en `AuditLog` —append-only— y no en una
 * columna que se pueda reescribir.
 *
 * El gate es deliberadamente barato: una pantalla que se lee y se acepta. No se
 * trata de poner un examen, se trata de que nadie pueda decir que no le
 * contaron lo que estaba firmando.
 */

export async function hasAiLiteracy(orgId: string, userId: string): Promise<boolean> {
  const found = await prisma.auditLog.findFirst({
    where: {
      orgId,
      actorUserId: userId,
      action: AI_LITERACY_ACTION,
      entityType: AI_LITERACY_ENTITY,
      entityId: AI_LITERACY_VERSION,
    },
    select: { id: true },
  });
  return found != null;
}

export async function recordAiLiteracy(orgId: string, userId: string): Promise<void> {
  if (await hasAiLiteracy(orgId, userId)) return;
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: userId,
      action: AI_LITERACY_ACTION,
      entityType: AI_LITERACY_ENTITY,
      entityId: AI_LITERACY_VERSION,
      metadata: { version: AI_LITERACY_VERSION },
    },
  });
}

/** Quién del equipo lo tiene acreditado, para que dirección pueda enseñarlo. */
export async function listAiLiteracyRecords(orgId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { orgId, action: AI_LITERACY_ACTION, entityType: AI_LITERACY_ENTITY },
    orderBy: { createdAt: "desc" },
    select: { actorUserId: true, entityId: true, createdAt: true, actor: { select: { name: true } } },
  });
  return rows.map((r) => ({
    userId: r.actorUserId,
    name: r.actor?.name ?? "—",
    version: r.entityId,
    acknowledgedAt: r.createdAt,
    current: r.entityId === AI_LITERACY_VERSION,
  }));
}

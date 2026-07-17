import { prisma } from "@/lib/prisma";
import { canViewHealthData } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * Punto único de lectura de datos de salud (A.2.4 / ADR-005 / ADR-008).
 * Aplica la matriz de permisos y dejar registro append-only de cada acceso
 * de lectura. Recepción y roles sin autorización reciben `null` en vez de
 * los registros, nunca un error que revele si existen o no.
 */
export async function getHealthRecordsForMember({
  memberId,
  orgId,
  actorUserId,
  actorRole,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  if (!canViewHealthData(actorRole)) {
    return null;
  }

  const records = await prisma.healthRecord.findMany({
    where: { memberId },
    orderBy: { reportedAt: "desc" },
    include: { reportedBy: { select: { name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_RECORD_READ",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { recordCount: records.length },
    },
  });

  return records;
}

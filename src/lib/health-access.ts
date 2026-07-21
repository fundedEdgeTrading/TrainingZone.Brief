import { prisma } from "@/lib/prisma";
import { canViewHealthData, canEditHealthData } from "@/lib/rbac";
import type { Role, HealthRecordType, HealthSeverity } from "@prisma/client";

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

/**
 * Salud del LEAD (F8/§2.1.b): mismo punto único, mismo tratamiento Art. 9. Al
 * convertir el lead (RB-LEAD-007) el registro solo cambia de FK — nunca se
 * recaptura — así que este único modelo (HealthRecord.leadId) cubre ambos casos.
 */
export async function getHealthRecordsForLead({
  leadId,
  orgId,
  actorUserId,
  actorRole,
}: {
  leadId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  if (!canViewHealthData(actorRole)) return null;

  const records = await prisma.healthRecord.findMany({
    where: { leadId },
    orderBy: { reportedAt: "desc" },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "LEAD_HEALTH_RECORD_READ",
      entityType: "Lead",
      entityId: leadId,
      metadata: { recordCount: records.length },
    },
  });

  return records;
}

/**
 * Captura inicial de salud de un lead (RB-LEAD-001: obligatorio, aunque sea
 * "ninguna"). Dos orígenes posibles: el propio lead vía formulario público
 * (sin actor, es su propio dato) o el staff que lo atiende (gateado como el
 * resto de escritura de salud). Ambos casos dejan rastro en AuditLog.
 */
export async function createHealthRecordForLead({
  leadId,
  orgId,
  description,
  actor,
}: {
  leadId: string;
  orgId: string;
  description: string;
  actor: { userId: string; role: Role } | null;
}): Promise<HealthWriteResult> {
  if (actor && !canEditHealthData(actor.role)) return { ok: false, error: "forbidden" };

  const record = await prisma.healthRecord.create({
    data: {
      leadId,
      type: "CHRONIC_CONDITION",
      zone: null,
      description,
      severity: "LOW",
      status: "ACTIVE",
      reportedByUserId: actor?.userId,
      consentSignedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: actor?.userId,
      action: "LEAD_HEALTH_RECORD_CREATED",
      entityType: "Lead",
      entityId: leadId,
      metadata: { recordId: record.id },
    },
  });

  return { ok: true };
}

export type HealthWriteResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not_found" | "no_consent" };

/**
 * Alta de un registro de salud (lesión, condición crónica...) por el MISMO
 * punto único que la lectura: aplica la matriz de permisos, exige
 * consentimiento explícito de datos de salud (Art. 9 RGPD) y deja rastro
 * append-only en AuditLog. Devuelve un resultado tipado en vez de lanzar, para
 * que la UI no revele si un socio existe o no a roles sin autorización.
 */
export async function createHealthRecord({
  memberId,
  orgId,
  actorUserId,
  actorRole,
  input,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  input: {
    type: HealthRecordType;
    zone: string | null;
    description: string;
    severity: HealthSeverity;
  };
}): Promise<HealthWriteResult> {
  if (!canEditHealthData(actorRole)) return { ok: false, error: "forbidden" };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "not_found" };
  if (!member.consentHealth) return { ok: false, error: "no_consent" };

  const record = await prisma.healthRecord.create({
    data: {
      memberId,
      type: input.type,
      zone: input.zone,
      description: input.description,
      severity: input.severity,
      status: "ACTIVE",
      reportedByUserId: actorUserId,
      consentSignedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_RECORD_CREATED",
      entityType: "HealthRecord",
      entityId: record.id,
      memberId,
      metadata: { type: input.type, zone: input.zone, severity: input.severity },
    },
  });

  return { ok: true };
}

/**
 * Marca un registro de salud como resuelto (mismo punto único, mismo control de
 * permisos y auditoría). El registro se valida contra la organización del actor
 * para evitar accesos cruzados entre tenants.
 */
export async function resolveHealthRecord({
  recordId,
  orgId,
  actorUserId,
  actorRole,
}: {
  recordId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
}): Promise<HealthWriteResult> {
  if (!canEditHealthData(actorRole)) return { ok: false, error: "forbidden" };

  const record = await prisma.healthRecord.findFirst({
    where: { id: recordId, member: { orgId } },
    select: { id: true, memberId: true },
  });
  if (!record) return { ok: false, error: "not_found" };

  await prisma.healthRecord.update({
    where: { id: recordId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_RECORD_RESOLVED",
      entityType: "HealthRecord",
      entityId: recordId,
      memberId: record.memberId,
    },
  });

  return { ok: true };
}


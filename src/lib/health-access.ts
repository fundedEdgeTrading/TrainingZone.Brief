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

/**
 * Propagación del screening de una valoración (F3 §4.3). Si las lesiones
 * declaradas se quedaran dentro de `Assessment.answers`, el Semáforo de Aptitud
 * y el Session Brief no se enterarían de ellas — y son justo las dos cosas para
 * las que se pregunta. Entra por el mismo punto único que el resto: permisos,
 * consentimiento de salud y rastro append-only en AuditLog.
 */
export async function createHealthRecordsFromAssessment({
  memberId,
  orgId,
  actorUserId,
  actorRole,
  assessmentId,
  records,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  assessmentId: string;
  records: {
    type: HealthRecordType;
    zone: string | null;
    description: string;
    severity: HealthSeverity;
  }[];
}): Promise<HealthWriteResult> {
  if (!canEditHealthData(actorRole)) return { ok: false, error: "forbidden" };
  if (!records.length) return { ok: true };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "not_found" };
  if (!member.consentHealth) return { ok: false, error: "no_consent" };

  const now = new Date();
  await prisma.healthRecord.createMany({
    data: records.map((r) => ({
      memberId,
      type: r.type,
      zone: r.zone,
      description: r.description,
      severity: r.severity,
      status: "ACTIVE" as const,
      reportedByUserId: actorUserId,
      consentSignedAt: now,
    })),
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_RECORD_CREATED_FROM_ASSESSMENT",
      entityType: "Assessment",
      entityId: assessmentId,
      memberId,
      metadata: { count: records.length, zones: records.map((r) => r.zone) },
    },
  });

  return { ok: true };
}

/**
 * Datos que salen del centro hacia la API de Claude para generar un mesociclo
 * (F6). Solo esto: edad, sexo, métricas, objetivos y criterios clínicos.
 * NUNCA nombre, DNI, teléfono ni email.
 */
export type MesocycleBriefing = {
  age: number | null;
  sex: string | null;
  level: string;
  weeks: number;
  goals: string[];
  availability: string[];
  metrics: string[];
  /** `null` = el socio no ha consentido el tratamiento por IA (vía sin datos clínicos). */
  clinical: string[] | null;
  assessmentNotes: string[];
};

const SEX_LABEL: Record<string, string> = { MALE: "hombre", FEMALE: "mujer", OTHER: "otro" };

/**
 * Claves del cuestionario de valoración que NO se envían aunque el formulario
 * evolucione y las añada. `Assessment.answers` es Json libre (F3): la lista de
 * permitidos no se puede fijar, así que se fija la de prohibidos y se
 * descartan los valores que no son escalares.
 */
const IDENTITY_ANSWER_KEYS = /nombre|apellid|dni|nif|nie|pasaporte|tel[eé]fono|movil|m[oó]vil|email|correo|direcci[oó]n|contacto/i;

/**
 * Seudonimización en el borde (F6 §7.3): único punto por el que los datos de un
 * socio salen hacia la IA, con el mismo registro append-only en `AuditLog` que
 * cualquier otra lectura de salud. Generar un mesociclo se audita igual que
 * abrir un Session Brief.
 */
export async function getMesocycleBriefingForMember({
  memberId,
  orgId,
  actorUserId,
  actorRole,
  level,
  weeks,
  availability,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  level: string;
  weeks: number;
  availability: string[];
}): Promise<MesocycleBriefing | null> {
  if (!canViewHealthData(actorRole)) return null;

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { birthDate: true, sex: true, consentAI: true },
  });
  if (!member) return null;

  const [goals, metrics, assessment, healthRecords] = await Promise.all([
    prisma.clientGoal.findMany({ where: { memberId, isTemplate: false }, select: { label: true } }),
    prisma.performanceMetric.findMany({
      where: { memberId },
      orderBy: { recordedAt: "desc" },
      select: { key: true, value: true, unit: true, recordedAt: true },
    }),
    prisma.assessment.findFirst({
      where: { memberId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { kind: true, answers: true },
    }),
    member.consentAI
      ? prisma.healthRecord.findMany({
          where: { memberId, status: "ACTIVE" },
          select: { type: true, zone: true, description: true, severity: true },
        })
      : Promise.resolve([]),
  ]);

  const briefing: MesocycleBriefing = {
    age: ageFrom(member.birthDate),
    sex: member.sex ? (SEX_LABEL[member.sex] ?? null) : null,
    level,
    weeks,
    goals: goals.map((g) => g.label),
    availability,
    metrics: latestByKey(metrics).map((m) => `${m.key}: ${m.value} ${m.unit}`),
    clinical: member.consentAI
      ? healthRecords.map((r) =>
          [r.type, r.zone, r.description].filter(Boolean).join(" · ") + ` (severidad ${r.severity})`
        )
      : null,
    assessmentNotes: assessment ? answerNotes(assessment.answers) : [],
  };

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "MESOCYCLE_AI_INPUT_READ",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: {
        consentAI: member.consentAI,
        clinicalItems: briefing.clinical?.length ?? 0,
        weeks,
      },
    },
  });

  return briefing;
}

function ageFrom(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

/** La serie temporal completa no aporta al plan: solo la marca más reciente de cada clave. */
function latestByKey<T extends { key: string }>(metrics: T[]): T[] {
  const seen = new Set<string>();
  return metrics.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
}

function answerNotes(answers: unknown): string[] {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return [];
  return Object.entries(answers as Record<string, unknown>)
    .filter(([key, value]) => !IDENTITY_ANSWER_KEYS.test(key) && isScalar(value))
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

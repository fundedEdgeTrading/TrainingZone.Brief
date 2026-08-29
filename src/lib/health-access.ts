import { prisma } from "@/lib/prisma";
import { canViewHealthData, canEditHealthData } from "@/lib/rbac";
import type { AssessmentKind, Role, HealthRecordType, HealthSeverity, HealthStatus } from "@prisma/client";
import { OPEN_HEALTH_STATUSES } from "@/lib/health-status";
import { parseAnswers } from "@/lib/assessments/queries";
import {
  ASSESSMENT_KIND_LABEL,
  DAYS_PER_WEEK_LABEL,
  PAIN_ZONE_LABEL,
  isInitialAnswers,
} from "@/lib/assessments/schemas";

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
    /** Cuándo se lesionó, si se sabe. Distinta de `reportedAt` (cuándo se registró). */
    injuryDate?: Date | null;
    /** El socio solo supo decir mes y año: el día guardado es relleno. */
    injuryDateApprox?: boolean;
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
      injuryDate: input.injuryDate ?? null,
      injuryDateApprox: input.injuryDate ? (input.injuryDateApprox ?? false) : false,
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
      metadata: {
        type: input.type,
        zone: input.zone,
        severity: input.severity,
        injuryDate: input.injuryDate?.toISOString() ?? null,
        injuryDateApprox: input.injuryDate ? (input.injuryDateApprox ?? false) : false,
      },
    },
  });

  return { ok: true };
}

/**
 * Cambio de fase de un registro de salud: ACTIVE → IN_REHAB → RESOLVED, o
 * CHRONIC para lo que no se va a resolver. Sustituye al antiguo
 * `resolveHealthRecord`, que solo sabía hacer un salto de los cuatro posibles.
 *
 * Entra por el mismo punto único que el resto: mismo permiso que editar
 * cualquier dato de salud (`canEditHealthData`, sin restricción adicional por
 * fase — quien puede registrar una lesión puede decir en qué fase está), mismo
 * aislamiento por organización a través del socio, y el mismo rastro
 * append-only en `AuditLog`. Ese rastro ES el histórico de fases: quién
 * (`actorUserId`), cuándo (`createdAt`) y de qué a qué (`metadata.from/to`).
 * `HealthRecord.statusChangedAt` es solo la copia de lectura del último cambio.
 */
export async function updateHealthRecordStatus({
  recordId,
  orgId,
  actorUserId,
  actorRole,
  status,
}: {
  recordId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  status: HealthStatus;
}): Promise<HealthWriteResult> {
  if (!canEditHealthData(actorRole)) return { ok: false, error: "forbidden" };

  const record = await prisma.healthRecord.findFirst({
    where: { id: recordId, member: { orgId } },
    select: { id: true, memberId: true, status: true },
  });
  if (!record) return { ok: false, error: "not_found" };

  // Repetir la fase que ya tiene no es un error (dos pestañas abiertas, doble
  // clic), pero tampoco es un cambio: ni se escribe ni se audita como tal.
  if (record.status === status) return { ok: true };

  const now = new Date();
  await prisma.healthRecord.update({
    where: { id: recordId },
    data: {
      status,
      statusChangedAt: now,
      // `resolvedAt` sigue siendo "cuándo se dio por recuperada". Al salir de
      // RESOLVED (una recaída que vuelve a rehabilitación) se limpia: si no,
      // quedaría una fecha de alta médica sobre un registro vigente.
      resolvedAt: status === "RESOLVED" ? now : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_RECORD_STATUS_CHANGED",
      entityType: "HealthRecord",
      entityId: recordId,
      memberId: record.memberId,
      metadata: { from: record.status, to: status },
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
const ASSESSMENT_SEX_LABEL: Record<string, string> = { HOMBRE: "hombre", MUJER: "mujer", OTRO: "otro" };
const ACTIVITY_LEVEL_LABEL: Record<string, string> = { BAJO: "bajo", MEDIO: "medio", ALTO: "alto" };
const TECHNIQUE_LABEL: Record<string, string> = { BAJA: "baja", MEDIA: "media", ALTA: "alta" };

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
          // Vigente ≠ "activa": una lesión en rehabilitación o crónica también
          // condiciona el mesociclo (ver OPEN_HEALTH_STATUSES).
          where: { memberId, status: { in: OPEN_HEALTH_STATUSES } },
          select: { type: true, zone: true, description: true, severity: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const context = assessment ? assessmentContext(assessment.kind, assessment.answers) : null;

  const briefing: MesocycleBriefing = {
    age: ageFrom(member.birthDate) ?? context?.age ?? null,
    sex: (member.sex ? SEX_LABEL[member.sex] : null) ?? context?.sex ?? null,
    level: level.trim() || context?.level || "no registrado",
    weeks,
    goals: [...goals.map((g) => g.label), ...(context?.goals ?? [])],
    availability,
    metrics: [...latestByKey(metrics).map((m) => `${m.key}: ${m.value} ${m.unit}`), ...(context?.metrics ?? [])],
    clinical: member.consentAI
      ? [
          ...healthRecords.map(
            (r) =>
              [r.type, r.zone, r.description].filter(Boolean).join(" · ") +
              ` (severidad ${r.severity}, fase ${r.status})`
          ),
          ...(context?.clinical ?? []),
        ]
      : null,
    assessmentNotes: context?.notes ?? [],
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

/**
 * Reparto de la valoración de F3 entre lo que puede salir siempre y lo que
 * necesita `consentAI`. El corte no es "campo del bloque screening" sino "dato
 * de salud": el dolor declarado, lo que no tolera y las notas libres del
 * entrenador caen del lado clínico aunque el formulario los guarde en otro
 * bloque, porque es donde acaban las lesiones cuando se escriben a mano.
 *
 * Las valoraciones anteriores al esquema actual devuelven `null` en
 * `parseAnswers` y aquí simplemente no aportan nada: el mesociclo se genera con
 * el resto de la ficha en vez de reventar.
 */
function assessmentContext(kind: AssessmentKind, answers: unknown) {
  const parsed = parseAnswers(kind, answers);
  if (!parsed) return null;

  const notes: string[] = [`Valoración: ${ASSESSMENT_KIND_LABEL[kind]}`];
  const clinical: string[] = [];
  const metrics: string[] = [`peso: ${parsed.pesoKg} kg`];
  const goals: string[] = [];
  let age: number | null = null;
  let sex: string | null = null;
  let level: string | null = null;

  notes.push(
    `Entrena ${DAYS_PER_WEEK_LABEL[parsed.diasPorSemana] ?? parsed.diasPorSemana} por semana`,
    `Sueño ${parsed.calidadSueno}/5, estrés ${parsed.estres}/5, energía ${parsed.energia}/5`
  );
  clinical.push(`Dolor actual declarado: ${parsed.dolorActual}/10`);

  if (isInitialAnswers(kind, parsed)) {
    const { perfil, experiencia, screening, cierre } = parsed;

    age = perfil.edad;
    sex = ASSESSMENT_SEX_LABEL[perfil.sexo] ?? null;
    level = `actividad ${ACTIVITY_LEVEL_LABEL[experiencia.nivelActividad] ?? experiencia.nivelActividad}, técnica ${
      TECHNIQUE_LABEL[experiencia.tecnicaBasicos] ?? experiencia.tecnicaBasicos
    }, ${experiencia.haEntrenadoAntes ? `${experiencia.anosExperiencia} años de experiencia` : "sin experiencia previa"}`;

    metrics.push(`altura: ${perfil.alturaCm} cm`);
    goals.push(perfil.objetivoPrincipal);
    if (perfil.objetivoSecundario) goals.push(perfil.objetivoSecundario);
    if (perfil.motivacionReal) notes.push(`Motivación: ${perfil.motivacionReal}`);
    if (perfil.queLeHariaAbandonar) notes.push(`Lo que le haría abandonar: ${perfil.queLeHariaAbandonar}`);

    if (screening.cardiovascular) clinical.push("Antecedente cardiovascular declarado");
    if (screening.hipertension) clinical.push("Hipertensión declarada");
    if (screening.diabetes) clinical.push("Diabetes declarada");
    if (screening.medicacion) clinical.push(`Medicación: ${screening.medicacion}`);
    if (screening.cirugias) clinical.push(`Cirugías: ${screening.cirugias}`);
    if (screening.lesionesActuales) clinical.push(`Lesiones actuales: ${screening.lesionesActuales}`);
    if (screening.zonasDolor.length > 0) {
      clinical.push(`Zonas de dolor: ${screening.zonasDolor.map((z) => PAIN_ZONE_LABEL[z]).join(", ")}`);
    }
    if (experiencia.ejerciciosNoTolera) clinical.push(`No tolera: ${experiencia.ejerciciosNoTolera}`);
    if (cierre.notasEntrenador) clinical.push(`Notas del entrenador: ${cierre.notasEntrenador}`);
  } else {
    const { seguimiento, cierre } = parsed;

    notes.push(
      `Adherencia percibida ${seguimiento.adherenciaPercibida}/5, progreso percibido ${seguimiento.progresoPercibido}/5`
    );
    if (seguimiento.queHaMejorado) notes.push(`Ha mejorado: ${seguimiento.queHaMejorado}`);
    if (seguimiento.obstaculos) notes.push(`Obstáculos: ${seguimiento.obstaculos}`);
    if (seguimiento.objetivoProximoPeriodo) goals.push(seguimiento.objetivoProximoPeriodo);
    if (cierre.notasEntrenador) clinical.push(`Notas del entrenador: ${cierre.notasEntrenador}`);
  }

  return { notes, clinical, metrics, goals, age, sex, level };
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

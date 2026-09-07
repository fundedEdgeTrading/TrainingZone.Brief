import { prisma } from "@/lib/prisma";
import { canViewHealthData, canEditHealthData } from "@/lib/rbac";
import type {
  AssessmentKind,
  Role,
  HealthRecordType,
  HealthSeverity,
  HealthStatus,
  InjuryZone,
  Laterality,
} from "@prisma/client";
import { OPEN_HEALTH_STATUSES } from "@/lib/health-status";
import { canUseClinicalDataForAI } from "@/lib/consent";
import { withSignedPhotoUrls } from "@/lib/progress-photos";
import type { EpProfile } from "@/lib/ai/ep-profile";
import { parseAnswers } from "@/lib/assessments/queries";
import { injuryZoneLabel } from "@/lib/injury-zones";
import { scrubAll, scrubIdentifiers } from "@/lib/ai/pseudonymize";
import {
  ASSESSMENT_KIND_LABEL,
  DAYS_PER_WEEK_LABEL,
  INJURY_ZONE_TO_PAIN_ZONE,
  PAIN_ZONE_LABEL,
  isInitialAnswers,
  type PainZone,
  type ScreeningAnswers,
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
    // E1-08 · defensa en profundidad: el filtro de organización se aplica
    // también en la última barrera. Hoy los dos llamantes validan la
    // pertenencia, y por eso esto no es explotable — pero es exactamente por eso
    // que hay que arreglarlo antes de que aparezca un tercero. Un `memberId` de
    // otra organización devuelve lista vacía, nunca registros.
    where: { memberId, member: { orgId } },
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
 * Fotos de progreso y composición corporal (E10-02 · CN-02). El esquema ya lo
 * decía —*"Dato Art. 9 RGPD: mismo tratamiento que HealthRecord"*— y el código
 * lo incumplía: `members-queries.ts` cargaba `progressEntries` dentro del
 * `include` de la ficha, así que recepción veía `bodyFatPct`, `visceralFatRating`,
 * `bmi`, `metabolicAge`, la gráfica de evolución y las fotos frontal, de perfil
 * y de espalda de cualquier socio de su ámbito, sin dejar rastro.
 *
 * A partir de aquí toda lectura de STAFF pasa por aquí: misma matriz de
 * permisos que `HealthRecord` (recepción recibe `null`, nunca un error que
 * revele si el socio existe), mismo aislamiento por organización y el mismo
 * rastro append-only en `AuditLog`.
 */
export async function getProgressEntriesForMember({
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
  if (!canViewHealthData(actorRole)) return null;

  const entries = await prisma.memberProgressEntry.findMany({
    where: { memberId, member: { orgId } },
    orderBy: { date: "desc" },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "MEMBER_PROGRESS_READ",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { entryCount: entries.length },
    },
  });

  // E10-20: la foto ya no vive en la columna. El punto único de lectura es
  // también el que firma el enlace caducado a `/api/progress-photos`, para que
  // ninguna pantalla tenga que acordarse de hacerlo por su cuenta.
  return withSignedPhotoUrls(entries, memberId);
}

/**
 * Detalle clínico bajo demanda (E3-05 · CN-10). La tarjeta del Session Brief
 * imprimía la descripción cruda de cada condición: nombres de medicamentos,
 * cirugías y patologías, literalmente, en una pantalla abierta en la sala junto
 * a las seis personas que entrenan al lado. Es dato del Art. 9 y rompe la regla
 * básica: **el entrenador lee adaptaciones, no historiales**.
 *
 * Ahora la descripción no viaja con el brief: se pide expresamente, y pedirla
 * deja rastro. Los roles sin autorización reciben `null` — igual que en el
 * resto del módulo, para no revelar siquiera que el detalle existe.
 */
export async function getClinicalDetailForMember({
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
  if (!canViewHealthData(actorRole)) return null;

  const records = await prisma.healthRecord.findMany({
    where: { memberId, member: { orgId }, status: { in: OPEN_HEALTH_STATUSES } },
    orderBy: { reportedAt: "desc" },
    select: { id: true, type: true, zoneCode: true, side: true, description: true, severity: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_CLINICAL_DETAIL_READ",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { recordCount: records.length, from: "SESSION_BRIEF" },
    },
  });

  return records;
}

/**
 * El propio socio leyendo SU evolución (portal y app). Entra por el mismo punto
 * único —para que no quede ninguna lectura suelta de `MemberProgressEntry`—
 * pero sin la matriz de roles, que aquí no aplica: el titular del dato no
 * necesita autorización para ver lo suyo.
 *
 * Y sin entrada de auditoría, a propósito: `AuditLog` responde a "quién ha
 * mirado los datos de este socio" (ADR-008), y anotar cada vez que el titular
 * abre su propia pantalla llenaría de ruido justo el registro que tiene que
 * poder leerse cuando se pregunte por un acceso ajeno.
 */
export async function getOwnProgressEntries({ memberId, orgId }: { memberId: string; orgId: string }) {
  const entries = await prisma.memberProgressEntry.findMany({
    where: { memberId, member: { orgId } },
    orderBy: { date: "desc" },
  });
  // E10-20: mismo tratamiento que la lectura del staff — enlace firmado y
  // caducado, nunca los bytes de la foto dentro de la respuesta.
  return withSignedPhotoUrls(entries, memberId);
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
    // Misma defensa en profundidad que en el punto de lectura del socio (E1-08):
    // el lead también cuelga de una organización, y dejar aquí la puerta que se
    // acaba de cerrar al lado no tendría sentido.
    where: { leadId, lead: { orgId } },
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
 * Captura inicial de salud de un lead. Dos orígenes posibles: el propio lead
 * vía formulario público (sin actor, es su propio dato) o el staff que lo
 * atiende (gateado como el resto de escritura de salud). Ambos casos dejan
 * rastro en AuditLog.
 *
 * E10-01: `consent` es OBLIGATORIO y explícito. Antes esta función estampaba
 * `consentSignedAt: new Date()` sin mirar, es decir, firmaba por el interesado
 * un consentimiento que nadie le había pedido (arts. 7 y 9.2.a RGPD). Ahora la
 * firma la trae quien recogió la casilla, con la versión del texto que la
 * persona tenía delante; `null` significa que no consta consentimiento, y
 * entonces `consentSignedAt` se queda vacío en vez de mentir. La versión viaja
 * en `AuditLog.metadata` porque `HealthRecord` no tiene columna para ella.
 */
export async function createHealthRecordForLead({
  leadId,
  orgId,
  description,
  actor,
  consent,
}: {
  leadId: string;
  orgId: string;
  description: string;
  actor: { userId: string; role: Role } | null;
  consent: { signedAt: Date; version: string } | null;
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
      consentSignedAt: consent?.signedAt ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: actor?.userId,
      action: "LEAD_HEALTH_RECORD_CREATED",
      entityType: "Lead",
      entityId: leadId,
      metadata: { recordId: record.id, consentVersion: consent?.version ?? null },
    },
  });

  return { ok: true };
}

export type HealthWriteResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "not_found" | "no_consent" };

/**
 * Declaración de salud mínima que el propio socio hace en el muro de alta
 * (E5-08/F-ALTA), antes de tener entrenador asignado. Mismo patrón que
 * `createHealthRecordForLead`: obligatoria aunque sea "ninguna", sin actor de
 * staff detrás — es su propio dato, y declararlo ES el consentimiento mínimo
 * de Art. 9 RGPD para tratarlo (`consentHealth`).
 */
export async function createSelfDeclaredHealthRecord({
  memberId,
  orgId,
  description,
}: {
  memberId: string;
  orgId: string;
  description: string;
}): Promise<void> {
  const now = new Date();
  await prisma.member.update({ where: { id: memberId }, data: { consentHealth: true, consentHealthAt: now } });

  const record = await prisma.healthRecord.create({
    data: { memberId, type: "CHRONIC_CONDITION", zone: null, description, severity: "LOW", status: "ACTIVE", consentSignedAt: now },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      action: "MEMBER_HEALTH_SELF_DECLARED",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { recordId: record.id },
    },
  });
}

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
    /** Zona del catálogo cerrado (E3-02). Es lo que empareja con `AptitudeRule`. */
    zoneCode: InjuryZone | null;
    side: Laterality | null;
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
      // El texto libre se deriva del catálogo en vez de capturarse: los
      // formularios ya no lo preguntan (E3-02), pero la columna sigue siendo el
      // rótulo legible que leen las pantallas y exportaciones antiguas.
      zone: input.zoneCode ? injuryZoneLabel(input.zoneCode, input.side) : null,
      zoneCode: input.zoneCode,
      side: input.side,
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
        zone: input.zoneCode,
        side: input.side,
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
    zoneCode: InjuryZone | null;
    side: Laterality | null;
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
      zone: r.zoneCode ? injuryZoneLabel(r.zoneCode, r.side) : null,
      zoneCode: r.zoneCode,
      side: r.side,
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
      metadata: {
        count: records.length,
        zones: records.map((r) => (r.zoneCode ? { zone: r.zoneCode, side: r.side } : null)),
      },
    },
  });

  return { ok: true };
}

/**
 * Estado declarado HOY, para precargar el screening de una revisión (E3-06).
 *
 * Las zonas salen de los `HealthRecord` vigentes —no de la última valoración—
 * porque son la verdad que usa el semáforo y recogen también lo que se haya
 * añadido a mano en la ficha desde entonces. Las casillas y los textos libres
 * sí vienen de la última valoración completada: son respuestas a una pregunta,
 * y no se pueden reconstruir de un registro clínico sin adivinar.
 */
export async function getScreeningDraftForMember({
  memberId,
  orgId,
  actorUserId,
  actorRole,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
}): Promise<ScreeningAnswers | null> {
  if (!canViewHealthData(actorRole)) return null;

  const [records, last] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { memberId, member: { orgId }, type: "INJURY", status: { in: OPEN_HEALTH_STATUSES } },
      select: { zoneCode: true, side: true },
    }),
    prisma.assessment.findFirst({
      where: { memberId, orgId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { kind: true, answers: true },
    }),
  ]);

  const zonasDolor: PainZone[] = [];
  const lateralidadDolor: ScreeningAnswers["lateralidadDolor"] = {};
  for (const record of records) {
    if (!record.zoneCode) continue;
    const painZone = INJURY_ZONE_TO_PAIN_ZONE[record.zoneCode];
    if (!painZone || zonasDolor.includes(painZone)) continue;
    zonasDolor.push(painZone);
    if (record.side && record.side !== "NO_APLICA") lateralidadDolor[painZone] = record.side;
  }

  const previous = last ? parseAnswers(last.kind, last.answers) : null;
  const screening = previous && "screening" in previous ? previous.screening : undefined;

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_RECORD_READ",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { recordCount: records.length, from: "ASSESSMENT_REVIEW_DRAFT" },
    },
  });

  return {
    cardiovascular: screening?.cardiovascular ?? false,
    hipertension: screening?.hipertension ?? false,
    diabetes: screening?.diabetes ?? false,
    medicacion: screening?.medicacion ?? "",
    cirugias: screening?.cirugias ?? "",
    // Lo que se escribió la vez anterior NO se arrastra: "molestia en el hombro
    // desde marzo" contestaba a marzo. Se vuelve a preguntar en blanco.
    lesionesActuales: "",
    zonasDolor,
    lateralidadDolor,
  };
}

/**
 * Traza de la apertura de un mesociclo con criterios clínicos (E3-18 · RB-IA-005).
 *
 * `Mesocycle.safetyCriteria` y `Mesocycle.aiConversation` —que contiene el
 * briefing íntegro con la sección "Screening clínico"— se leían sin pasar por
 * aquí y sin escribir en `AuditLog`. El control por rol SÍ coincidía; lo que se
 * perdía era la traza, que es justo lo que el resto del sistema sí tiene.
 *
 * Esta historia añade TRAZA, NO ACCESO: los permisos no cambian, y por eso no
 * hay aquí ninguna decisión de autorización que la pantalla no tomara ya.
 */
export async function auditMesocycleOpened({
  mesocycleId,
  memberId,
  orgId,
  actorUserId,
  clinicalCriteria,
  hasAiConversation,
}: {
  mesocycleId: string;
  memberId: string;
  orgId: string;
  actorUserId: string;
  clinicalCriteria: number;
  hasAiConversation: boolean;
}): Promise<void> {
  // Un mesociclo sin un solo criterio clínico ni conversación guardada no lleva
  // dato del Art. 9: anotarlo llenaría el registro de ruido y taparía lo que sí
  // importa.
  if (clinicalCriteria === 0 && !hasAiConversation) return;

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "MESOCYCLE_CLINICAL_OPENED",
      entityType: "Mesocycle",
      entityId: mesocycleId,
      memberId,
      metadata: { clinicalCriteria, hasAiConversation },
    },
  });
}

/**
 * Lectura de `SessionDebrief.pain` fuera del entrenador de la sesión (E3-18).
 * El dolor declarado es dato de salud y hasta ahora salía en la media del
 * debrief (`feedbackAvg`) sin dejar rastro de quién lo miraba.
 */
export async function auditSessionPainRead({
  memberId,
  orgId,
  actorUserId,
  source,
  debriefCount,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  source: string;
  debriefCount: number;
}): Promise<void> {
  if (debriefCount === 0) return;

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "SESSION_DEBRIEF_PAIN_READ",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { source, debriefCount },
    },
  });
}

export type ScreeningReconciliation = {
  /** Lesiones declaradas HOY, tal y como salen del bloque de zonas de dolor. */
  injuries: { zoneCode: InjuryZone; side: Laterality | null; description: string; severity: HealthSeverity }[];
  /**
   * Zonas que el cuestionario es capaz de expresar. Solo dentro de esta lista se
   * puede dar una lesión por resuelta: el catálogo tiene zonas que la valoración
   * ni pregunta (codo, muñeca, ingle, gemelo...) y una lesión ahí NO puede
   * resolverse por no aparecer marcada en un formulario que no la ofrece.
   */
  reconcilableZones: InjuryZone[];
  /** Condiciones no lesionales del screening (medicación, cirugías, crónicas). */
  conditions: { type: HealthRecordType; description: string; severity: HealthSeverity }[];
};

export type ReconcileResult =
  | { ok: true; created: number; resolved: number }
  | { ok: false; error: "forbidden" | "not_found" | "no_consent" };

/**
 * Revisión periódica de valoración (E3-06): lo declarado hoy contra lo que ya
 * consta. Es lo que hace que una lumbalgia que aparece en el mes 4 entre en el
 * semáforo sin que nadie la teclee a mano en la ficha.
 *
 * Tres reglas:
 *  · zona marcada que antes no estaba → se crea el `HealthRecord`;
 *  · zona que deja de estar marcada → se marca RESUELTA con fecha, **nunca se
 *    borra**: el histórico clínico no se reescribe;
 *  · zona que sigue igual → no se toca nada, así que repetir la revisión sin
 *    cambios no duplica ni un registro.
 *
 * La identidad de una lesión es su ZONA, no su lado: cambiar el lado es editar
 * la lesión, y eso se hace desde la ficha. Una revisión es una lista de
 * comprobación, no un editor.
 */
export async function reconcileScreeningFromAssessment({
  memberId,
  orgId,
  actorUserId,
  actorRole,
  assessmentId,
  screening,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  assessmentId: string;
  screening: ScreeningReconciliation;
}): Promise<ReconcileResult> {
  if (!canEditHealthData(actorRole)) return { ok: false, error: "forbidden" };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "not_found" };
  if (!member.consentHealth) return { ok: false, error: "no_consent" };

  const open = await prisma.healthRecord.findMany({
    where: { memberId, status: { in: OPEN_HEALTH_STATUSES } },
    select: { id: true, type: true, zoneCode: true, description: true },
  });

  const now = new Date();
  const declaredZones = new Set(screening.injuries.map((i) => i.zoneCode));
  const openInjuryZones = new Set(
    open.filter((r) => r.type === "INJURY" && r.zoneCode).map((r) => r.zoneCode as InjuryZone)
  );

  const toCreate = [
    ...screening.injuries
      .filter((i) => !openInjuryZones.has(i.zoneCode))
      .map((i) => ({
        memberId,
        type: "INJURY" as const,
        zone: injuryZoneLabel(i.zoneCode, i.side),
        zoneCode: i.zoneCode,
        side: i.side,
        description: i.description,
        severity: i.severity,
        status: "ACTIVE" as const,
        reportedByUserId: actorUserId,
        consentSignedAt: now,
      })),
    // Las condiciones no lesionales se identifican por tipo + texto: sin esto,
    // cada revisión volvería a crear "Hipertensión declarada".
    ...screening.conditions
      .filter((c) => !open.some((r) => r.type === c.type && r.description === c.description))
      .map((c) => ({
        memberId,
        type: c.type,
        zone: null,
        zoneCode: null,
        side: null,
        description: c.description,
        severity: c.severity,
        status: "ACTIVE" as const,
        reportedByUserId: actorUserId,
        consentSignedAt: now,
      })),
  ];

  const reconcilable = new Set(screening.reconcilableZones);
  const toResolve = open.filter(
    (r) =>
      r.type === "INJURY" &&
      r.zoneCode !== null &&
      reconcilable.has(r.zoneCode) &&
      !declaredZones.has(r.zoneCode)
  );

  if (toCreate.length) await prisma.healthRecord.createMany({ data: toCreate });

  for (const record of toResolve) {
    await prisma.healthRecord.update({
      where: { id: record.id },
      data: { status: "RESOLVED", statusChangedAt: now, resolvedAt: now },
    });
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "HEALTH_RECORD_STATUS_CHANGED",
        entityType: "HealthRecord",
        entityId: record.id,
        memberId,
        metadata: { to: "RESOLVED", via: "ASSESSMENT_REVIEW", assessmentId },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "HEALTH_SCREENING_RECONCILED",
      entityType: "Assessment",
      entityId: assessmentId,
      memberId,
      metadata: { created: toCreate.length, resolved: toResolve.length },
    },
  });

  return { ok: true, created: toCreate.length, resolved: toResolve.length };
}

/**
 * Datos que salen del centro hacia la API de Claude para generar un mesociclo
 * (F6). Solo esto: edad, sexo, métricas, objetivos y criterios clínicos.
 * NUNCA nombre, DNI, teléfono ni email.
 */
export type MesocycleBriefing = {
  /** Grupo Training Zone elegido por el entrenador; decide la metodología del sistema. */
  profile: EpProfile;
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
  profile,
  level,
  weeks,
  availability,
}: {
  memberId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  profile: EpProfile;
  level: string;
  weeks: number;
  availability: string[];
}): Promise<MesocycleBriefing | null> {
  if (!canViewHealthData(actorRole)) return null;

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    // El nombre NO viaja: se lee para poder BORRARLO del texto libre. Es el
    // identificador que más veces aparece escrito en las notas del propio socio.
    select: { birthDate: true, sex: true, consentAI: true, consentHealth: true, firstName: true, lastName: true },
  });
  if (!member) return null;

  // `consentAI` a secas no basta: sin `consentHealth`, el socio se opuso al
  // tratamiento de sus datos de salud y no hay dato que enviar aunque siga
  // consintiendo el uso de IA (ver `canUseClinicalDataForAI` en consent.ts).
  const clinicalAllowed = canUseClinicalDataForAI(member);

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
    clinicalAllowed
      ? prisma.healthRecord.findMany({
          // Vigente ≠ "activa": una lesión en rehabilitación o crónica también
          // condiciona el mesociclo (ver OPEN_HEALTH_STATUSES).
          where: { memberId, status: { in: OPEN_HEALTH_STATUSES } },
          select: { type: true, zone: true, description: true, severity: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const context = assessment ? assessmentContext(assessment.kind, assessment.answers) : null;

  // E3-15 · RB-IA-004: filtro de identificadores sobre TODO el texto libre que
  // sale del centro. Cubre los siete campos que hasta ahora viajaban sin tocar
  // (`HealthRecord.description`, `cierre.notasEntrenador`, `screening.lesionesActuales`,
  // `screening.medicacion`, `screening.cirugias`, `perfil.motivacionReal` y
  // `ClientGoal.label`), porque todos desembocan aquí. Se aplica en este punto y
  // no en cada origen: así un campo nuevo no puede escaparse por olvido.
  const scrub = { knownNames: [member.firstName, member.lastName].filter(Boolean) as string[] };

  const briefing: MesocycleBriefing = {
    profile,
    age: ageFrom(member.birthDate) ?? context?.age ?? null,
    sex: (member.sex ? SEX_LABEL[member.sex] : null) ?? context?.sex ?? null,
    level: scrubIdentifiers(level.trim(), scrub) || context?.level || "no registrado",
    weeks,
    goals: scrubAll([...goals.map((g) => g.label), ...(context?.goals ?? [])], scrub),
    availability,
    metrics: [...latestByKey(metrics).map((m) => `${m.key}: ${m.value} ${m.unit}`), ...(context?.metrics ?? [])],
    clinical: clinicalAllowed
      ? scrubAll(
          [
            ...healthRecords.map(
              (r) =>
                [r.type, r.zone, r.description].filter(Boolean).join(" · ") +
                ` (severidad ${r.severity}, fase ${r.status})`
            ),
            ...(context?.clinical ?? []),
          ],
          scrub
        )
      : null,
    assessmentNotes: scrubAll(context?.notes ?? [], scrub),
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
        consentHealth: member.consentHealth,
        clinicalItems: briefing.clinical?.length ?? 0,
        // Queda constancia de que lo que salió pasó por el filtro (RB-IA-004).
        identifierFilter: "RB-IA-004",
        profile,
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
/** La nota se lee entera en el Session Brief: empieza en mayúscula. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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

  // Las constantes de escala son desactivables por organización (F-VAL): lo que
  // el centro no pregunta no se inventa aquí, simplemente no entra en la nota.
  if (parsed.diasPorSemana) {
    notes.push(`Entrena ${DAYS_PER_WEEK_LABEL[parsed.diasPorSemana] ?? parsed.diasPorSemana} por semana`);
  }
  const escalas = [
    parsed.calidadSueno ? `sueño ${parsed.calidadSueno}/5` : null,
    parsed.estres ? `estrés ${parsed.estres}/5` : null,
    parsed.energia ? `energía ${parsed.energia}/5` : null,
  ].filter(Boolean);
  if (escalas.length) notes.push(capitalize(escalas.join(", ")));
  clinical.push(`Dolor actual declarado: ${parsed.dolorActual}/10`);

  if (isInitialAnswers(kind, parsed)) {
    const { perfil, experiencia, screening, cierre } = parsed;

    age = perfil.edad;
    sex = ASSESSMENT_SEX_LABEL[perfil.sexo] ?? null;
    const rasgos = [
      experiencia.nivelActividad
        ? `actividad ${ACTIVITY_LEVEL_LABEL[experiencia.nivelActividad] ?? experiencia.nivelActividad}`
        : null,
      experiencia.tecnicaBasicos
        ? `técnica ${TECHNIQUE_LABEL[experiencia.tecnicaBasicos] ?? experiencia.tecnicaBasicos}`
        : null,
      experiencia.haEntrenadoAntes === undefined
        ? null
        : experiencia.haEntrenadoAntes
          ? `${experiencia.anosExperiencia} años de experiencia`
          : "sin experiencia previa",
    ].filter(Boolean);
    level = rasgos.length ? rasgos.join(", ") : null;

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

    const percibido = [
      seguimiento.adherenciaPercibida ? `adherencia percibida ${seguimiento.adherenciaPercibida}/5` : null,
      seguimiento.progresoPercibido ? `progreso percibido ${seguimiento.progresoPercibido}/5` : null,
    ].filter(Boolean);
    if (percibido.length) notes.push(capitalize(percibido.join(", ")));
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

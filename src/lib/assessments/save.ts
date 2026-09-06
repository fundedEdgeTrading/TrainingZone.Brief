import { prisma } from "@/lib/prisma";
import { createHealthRecordsFromAssessment, reconcileScreeningFromAssessment } from "@/lib/health-access";
import type { AssessmentKind, HealthRecordType, HealthSeverity, InjuryZone, Laterality, Role } from "@prisma/client";
import { defaultSideFor } from "@/lib/injury-zones";
import {
  INJURY_ZONE_TO_PAIN_ZONE,
  PAIN_ZONE_LABEL,
  PAIN_ZONE_TO_INJURY_ZONE,
  PERFORMANCE_MARKS,
  isInitialAnswers,
  type AssessmentAnswers,
  type InitialAssessmentAnswers,
  type ScreeningAnswers,
} from "./schemas";

export type SaveAssessmentResult =
  | { ok: true; assessmentId: string; healthRecordsCreated: number }
  | { ok: false; error: string };

type ScreeningHealthRecord = {
  type: HealthRecordType;
  zoneCode: InjuryZone | null;
  side: Laterality | null;
  description: string;
  severity: HealthSeverity;
};

/**
 * El dolor declarado hoy gradúa la severidad de la lesión: una lumbalgia con un
 * 8/10 no puede entrar al Semáforo de Aptitud con la misma etiqueta que una de 2.
 */
function severityFromPain(dolorActual: number): HealthSeverity {
  if (dolorActual >= 7) return "HIGH";
  if (dolorActual >= 4) return "MEDIUM";
  return "LOW";
}

/**
 * Traducción del screening a registros de salud (F3 §4.3). Es el paso que hace
 * que rellenar la valoración cambie el semáforo del socio y su Session Brief, en
 * vez de quedarse enterrado en `answers`.
 */
function healthRecordsFromScreening(answers: InitialAssessmentAnswers) {
  const { injuries, conditions } = splitScreening(answers.screening, answers.dolorActual);
  return [
    ...injuries.map((i) => ({
      type: "INJURY" as const,
      zoneCode: i.zoneCode,
      side: i.side,
      description: i.description,
      severity: i.severity,
    })),
    ...conditions.map((c) => ({ type: c.type, zoneCode: null, side: null, description: c.description, severity: c.severity })),
  ] satisfies ScreeningHealthRecord[];
}

/**
 * El bloque de screening partido en lo que es lesión (tiene zona, y por tanto
 * casa con una regla de aptitud) y lo que no. Compartido por la valoración
 * inicial —que lo propaga entero— y por la revisión (E3-06), que lo reconcilia
 * contra lo que ya consta.
 */
export function splitScreening(screening: ScreeningAnswers, dolorActual: number) {
  const severity = severityFromPain(dolorActual);
  const lesiones = screening.lesionesActuales.trim();
  const lados = screening.lateralidadDolor ?? {};

  const injuries = screening.zonasDolor.map((zone) => {
    const zoneCode = PAIN_ZONE_TO_INJURY_ZONE[zone];
    return {
      zoneCode,
      // E3-02: zona y lado se escriben por separado. Si la zona es axial el lado
      // es `NO_APLICA`; si tiene lado y el formulario no lo recogió, se queda sin
      // declarar en vez de inventarse uno.
      side: defaultSideFor(zoneCode) ?? lados[zone] ?? null,
      description: lesiones || `Dolor declarado en la valoración (${PAIN_ZONE_LABEL[zone]})`,
      severity,
    };
  });

  const conditions: { type: HealthRecordType; description: string; severity: HealthSeverity }[] = [];
  // Lesión descrita sin localizar: se registra igual, pero sin zona no cruza con
  // ninguna regla de aptitud — queda como aviso en el Session Brief.
  if (lesiones && !screening.zonasDolor.length) {
    conditions.push({ type: "INJURY", description: lesiones, severity });
  }
  if (screening.cirugias.trim()) {
    conditions.push({ type: "SURGERY", description: screening.cirugias.trim(), severity: "LOW" });
  }
  if (screening.medicacion.trim()) {
    conditions.push({ type: "MEDICATION", description: screening.medicacion.trim(), severity: "LOW" });
  }
  const chronic: [boolean, string][] = [
    [screening.cardiovascular, "Patología cardiovascular declarada en la valoración"],
    [screening.hipertension, "Hipertensión declarada en la valoración"],
    [screening.diabetes, "Diabetes declarada en la valoración"],
  ];
  for (const [declared, description] of chronic) {
    if (declared) conditions.push({ type: "CHRONIC_CONDITION", description, severity: "MEDIUM" });
  }

  return { injuries, conditions };
}

/** Zonas del catálogo que el cuestionario SÍ sabe preguntar. Fuera de aquí no se
 *  resuelve nada por omisión: una lesión de codo no desaparece porque el
 *  formulario no ofrezca la casilla. */
const RECONCILABLE_ZONES = Object.keys(INJURY_ZONE_TO_PAIN_ZONE) as InjuryZone[];

/** Objetivos que la valoración declara, para no duplicar los que ya tiene abiertos. */
function goalLabels(kind: AssessmentKind, answers: AssessmentAnswers): string[] {
  const labels = isInitialAnswers(kind, answers)
    ? [answers.perfil.objetivoPrincipal, answers.perfil.objetivoSecundario]
    : [answers.seguimiento.objetivoProximoPeriodo];
  return labels.map((l) => l.trim()).filter(Boolean);
}

/**
 * Guarda una valoración y la propaga (F3 §4.3): el cuestionario completo vive en
 * `answers`, pero cada dato que ya tiene modelo propio va a su modelo — salud a
 * HealthRecord, objetivos a ClientGoal, peso a la misma serie que composición
 * corporal y marcas a PerformanceMetric. Si el peso viviera solo aquí, la ficha
 * tendría dos gráficas que se contradicen.
 */
export async function saveAssessment({
  assessmentId,
  orgId,
  actorUserId,
  actorRole,
  answers,
}: {
  assessmentId: string;
  orgId: string;
  actorUserId: string;
  actorRole: Role;
  answers: AssessmentAnswers;
}): Promise<SaveAssessmentResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, orgId },
    select: { id: true, kind: true, memberId: true, completedAt: true },
  });
  if (!assessment) return { ok: false, error: "No se ha encontrado esa valoración." };
  // Una valoración completada es una foto de un día: no se reabre, se crea la
  // siguiente. Además evita duplicar los registros de salud ya propagados.
  if (assessment.completedAt) return { ok: false, error: "Esta valoración ya está completada." };

  const { kind, memberId } = assessment;
  const now = new Date();
  const initial = isInitialAnswers(kind, answers) ? answers : null;

  await prisma.$transaction(async (tx) => {
    await tx.assessment.update({
      where: { id: assessmentId },
      data: { answers, completedAt: now, filledByUserId: actorUserId },
    });

    if (initial) {
      // Los dos consentimientos son booleanos separados con fecha propia: el
      // PAR-Q es la puerta del Art. 9 y la imagen es voluntaria y revocable.
      // La autorización de imagen reutiliza los campos que ya existen en Member.
      await tx.member.update({
        where: { id: memberId },
        data: {
          consentHealth: true,
          consentHealthAt: now,
          consentImages: initial.cierre.autorizacionImagen,
          consentImagesAt: initial.cierre.autorizacionImagen ? now : null,
        },
      });
    }

    // Peso: misma serie que composición corporal, no una segunda gráfica paralela.
    await tx.memberProgressEntry.create({
      data: { memberId, date: now, weightKg: answers.pesoKg, source: "ASSESSMENT", measuredAt: now },
    });

    const marks = answers.marcas ?? [];
    if (marks.length) {
      await tx.performanceMetric.createMany({
        data: marks.map((m) => ({
          orgId,
          memberId,
          key: m.key,
          value: m.value,
          unit: PERFORMANCE_MARKS.find((p) => p.key === m.key)!.unit,
          recordedAt: now,
          source: "assessment",
        })),
      });
    }

    const labels = goalLabels(kind, answers);
    if (labels.length) {
      const open = await tx.clientGoal.findMany({
        where: { orgId, memberId, achievedAt: null },
        select: { label: true },
      });
      const known = new Set(open.map((g) => g.label.toLowerCase()));
      const fresh = labels.filter((l) => !known.has(l.toLowerCase()));
      if (fresh.length) {
        await tx.clientGoal.createMany({
          data: fresh.map((label) => ({ orgId, memberId, label, isTemplate: false })),
        });
      }
    }
  });

  // Fuera de la transacción a propósito: health-access.ts es el punto único de
  // escritura de salud (permisos + consentimiento + auditoría) y usa su propio
  // cliente. El consentimiento de salud acaba de quedar firmado arriba.
  let healthRecordsCreated = 0;
  if (initial) {
    const records = healthRecordsFromScreening(initial);
    const result = await createHealthRecordsFromAssessment({
      memberId,
      orgId,
      actorUserId,
      actorRole,
      assessmentId,
      records,
    });
    if (result.ok) healthRecordsCreated = records.length;
  } else if (answers.screening) {
    // E3-06 · la revisión no vuelca, RECONCILIA: crea lo que aparece, resuelve
    // con fecha lo que deja de estar marcado y no toca lo que sigue igual.
    const { injuries, conditions } = splitScreening(answers.screening, answers.dolorActual);
    const result = await reconcileScreeningFromAssessment({
      memberId,
      orgId,
      actorUserId,
      actorRole,
      assessmentId,
      screening: { injuries, conditions, reconcilableZones: RECONCILABLE_ZONES },
    });
    if (result.ok) healthRecordsCreated = result.created;
  }

  return { ok: true, assessmentId, healthRecordsCreated };
}

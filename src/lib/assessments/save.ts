import { prisma } from "@/lib/prisma";
import { createHealthRecordsFromAssessment } from "@/lib/health-access";
import type { AssessmentKind, HealthRecordType, HealthSeverity, Role } from "@prisma/client";
import {
  PAIN_ZONE_LABEL,
  PAIN_ZONE_TO_HEALTH_ZONE,
  PERFORMANCE_MARKS,
  isInitialAnswers,
  type AssessmentAnswers,
  type InitialAssessmentAnswers,
} from "./schemas";

export type SaveAssessmentResult =
  | { ok: true; assessmentId: string; healthRecordsCreated: number }
  | { ok: false; error: string };

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
  const records: { type: HealthRecordType; zone: string | null; description: string; severity: HealthSeverity }[] = [];
  const { screening } = answers;
  const injurySeverity = severityFromPain(answers.dolorActual);
  const lesiones = screening.lesionesActuales.trim();

  for (const zone of screening.zonasDolor) {
    records.push({
      type: "INJURY",
      zone: PAIN_ZONE_TO_HEALTH_ZONE[zone],
      description: lesiones || `Dolor declarado en la valoración inicial (${PAIN_ZONE_LABEL[zone]})`,
      severity: injurySeverity,
    });
  }
  // Lesión descrita sin localizar: se registra igual, pero sin zona no cruza con
  // ninguna regla de aptitud — queda como aviso en el Session Brief.
  if (lesiones && !screening.zonasDolor.length) {
    records.push({ type: "INJURY", zone: null, description: lesiones, severity: injurySeverity });
  }

  if (screening.cirugias.trim()) {
    records.push({ type: "SURGERY", zone: null, description: screening.cirugias.trim(), severity: "LOW" });
  }
  if (screening.medicacion.trim()) {
    records.push({ type: "MEDICATION", zone: null, description: screening.medicacion.trim(), severity: "LOW" });
  }
  const chronic: [boolean, string][] = [
    [screening.cardiovascular, "Patología cardiovascular declarada en la valoración inicial"],
    [screening.hipertension, "Hipertensión declarada en la valoración inicial"],
    [screening.diabetes, "Diabetes declarada en la valoración inicial"],
  ];
  for (const [declared, description] of chronic) {
    if (declared) records.push({ type: "CHRONIC_CONDITION", zone: null, description, severity: "MEDIUM" });
  }

  return records;
}

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
  }

  return { ok: true, assessmentId, healthRecordsCreated };
}

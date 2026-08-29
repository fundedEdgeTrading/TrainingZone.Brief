import Link from "next/link";
import { resolveTimezone } from "@/lib/timezone";
import { formatInstantDate } from "@/lib/date-utils";
import { notFound } from "next/navigation";
import { requireRole, memberIsInScope } from "@/lib/guard";
import { getAssessment, getAssessmentConfig, parseAnswers } from "@/lib/assessments/queries";
import { milestoneLabelOf } from "@/lib/assessments/config";
import {
  DAYS_PER_WEEK_LABEL,
  PAIN_ZONE_LABEL,
  PERFORMANCE_MARKS,
  isInitialAnswers,
  memberInitialPartSchema,
  type PainZone,
  type PerformanceMarkKey,
} from "@/lib/assessments/schemas";
import { Card } from "@/components/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { AssessmentForm } from "../assessment-form";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === "" || value === null || value === undefined) return null;
  return (
    <li className="flex items-baseline justify-between gap-4 py-1.5 border-b border-tz-sand last:border-0">
      <span className="text-xs uppercase tracking-[0.06em] font-bold text-brand-muted">{label}</span>
      <span className="text-sm text-brand-text text-right">{value}</span>
    </li>
  );
}

/** Una pregunta que el centro no hace no se pinta: `Row` ya ignora el undefined. */
function yesNo(value: boolean | undefined) {
  return value === undefined ? undefined : value ? "Sí" : "No";
}

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; assessmentId: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const { id, assessmentId } = await params;
  const timeZone = await resolveTimezone();

  const [assessment, config] = await Promise.all([
    getAssessment(session.user.orgId, assessmentId),
    getAssessmentConfig(session.user.orgId),
  ]);
  if (!assessment || assessment.memberId !== id) notFound();
  if (!(await memberIsInScope(session.user, id))) notFound();

  const answers = assessment.completedAt ? parseAnswers(assessment.kind, assessment.answers, config) : null;
  const marks = answers?.marcas ?? [];
  // Se listan TODAS las preguntas propias, también las retiradas: si el centro
  // dejó de hacer una, lo que ya se contestó sigue formando parte de la
  // valoración de aquel día.
  const customAnswers = config.customQuestions
    .map((q) => ({ question: q, answer: answers?.custom?.[q.key] }))
    .filter((row) => row.answer !== undefined && row.answer !== "");

  // F-ALTA: si el socio ya contestó su parte al entrar en la app, el formulario
  // arranca con ella escrita. Se valida en vez de confiarse: un borrador
  // guardado con una versión anterior del cuestionario se descarta sin ruido y
  // el entrenador rellena de cero, que es justo lo que hacía antes.
  const memberDraft =
    !assessment.completedAt && assessment.memberPartAt
      ? (memberInitialPartSchema.safeParse(assessment.answers).data ?? null)
      : null;

  return (
    <div className="tz-page space-y-4">
      <div className="space-y-1.5">
        <Link href={`/members/${id}/valoraciones`} className="text-sm text-tz-black hover:underline">
          ← Volver a las valoraciones
        </Link>
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
          {milestoneLabelOf(assessment, config.milestones)} · {assessment.member.firstName} {assessment.member.lastName}
        </h1>
        <p className="text-sm text-brand-muted">
          {assessment.completedAt
            ? `Completada el ${formatInstantDate(assessment.completedAt, timeZone)}${
                assessment.filledBy?.name ? ` por ${assessment.filledBy.name}` : ""
              }`
            : `Pendiente · vence el ${assessment.dueDate.toLocaleDateString("es-ES")}`}
        </p>
      </div>

      {!assessment.completedAt ? (
        <>
          {memberDraft && (
            <div className="bg-good-bg border border-good/30 rounded-card px-5 py-3.5">
              <p className="text-sm text-brand-text">
                <b>{assessment.member.firstName} ya rellenó su parte</b> el{" "}
                {formatInstantDate(assessment.memberPartAt!, timeZone)}: perfil, experiencia y constantes vienen
                de sus respuestas y puedes corregirlas. Quedan el screening de salud, las marcas y el PAR-Q.
              </p>
            </div>
          )}
          <AssessmentForm
            assessmentId={assessment.id}
            memberId={id}
            kind={assessment.kind}
            config={config}
            draft={memberDraft}
          />
        </>
      ) : !answers ? (
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card">
          <EmptyState
            title="Valoración de un formulario anterior"
            description="Se guardó con una versión previa del cuestionario, así que no se puede mostrar con el detalle de hoy."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card title="Constantes">
            <ul className="list-none">
              <Row label="Peso" value={`${answers.pesoKg} kg`} />
              <Row label="Dolor actual" value={`${answers.dolorActual}/10`} />
              <Row label="Calidad del sueño" value={answers.calidadSueno && `${answers.calidadSueno}/5`} />
              <Row label="Estrés" value={answers.estres && `${answers.estres}/5`} />
              <Row label="Energía" value={answers.energia && `${answers.energia}/5`} />
              <Row
                label="Días por semana"
                value={answers.diasPorSemana && DAYS_PER_WEEK_LABEL[answers.diasPorSemana]}
              />
            </ul>
          </Card>

          {isInitialAnswers(assessment.kind, answers) ? (
            <>
              <Card title="Perfil">
                <ul className="list-none">
                  <Row label="Edad" value={answers.perfil.edad} />
                  <Row label="Sexo" value={answers.perfil.sexo} />
                  <Row label="Altura" value={`${answers.perfil.alturaCm} cm`} />
                  <Row label="Objetivo principal" value={answers.perfil.objetivoPrincipal} />
                  <Row label="Objetivo secundario" value={answers.perfil.objetivoSecundario} />
                  <Row label="Motivación real" value={answers.perfil.motivacionReal} />
                  <Row label="Qué le haría abandonar" value={answers.perfil.queLeHariaAbandonar} />
                </ul>
              </Card>
              <Card title="Experiencia">
                <ul className="list-none">
                  <Row label="Nivel de actividad" value={answers.experiencia.nivelActividad} />
                  <Row label="Ha entrenado antes" value={yesNo(answers.experiencia.haEntrenadoAntes)} />
                  <Row label="Años de experiencia" value={answers.experiencia.anosExperiencia} />
                  <Row label="Técnica en básicos" value={answers.experiencia.tecnicaBasicos} />
                  <Row label="No tolera" value={answers.experiencia.ejerciciosNoTolera} />
                </ul>
              </Card>
              <Card title="Screening de salud" meta="Propagado a la ficha de salud">
                <ul className="list-none">
                  <Row label="Cardiovascular" value={yesNo(answers.screening.cardiovascular)} />
                  <Row label="Hipertensión" value={yesNo(answers.screening.hipertension)} />
                  <Row label="Diabetes" value={yesNo(answers.screening.diabetes)} />
                  <Row label="Medicación" value={answers.screening.medicacion} />
                  <Row label="Cirugías" value={answers.screening.cirugias} />
                  <Row label="Lesiones actuales" value={answers.screening.lesionesActuales} />
                  <Row
                    label="Zonas de dolor"
                    value={answers.screening.zonasDolor.map((z: PainZone) => PAIN_ZONE_LABEL[z]).join(", ")}
                  />
                </ul>
              </Card>
              <Card title="Cierre">
                <ul className="list-none">
                  <Row label="PAR-Q firmado" value={yesNo(answers.cierre.consentimientoParq)} />
                  <Row label="Autorización de imagen" value={yesNo(answers.cierre.autorizacionImagen)} />
                  <Row label="Notas del entrenador" value={answers.cierre.notasEntrenador} />
                </ul>
              </Card>
            </>
          ) : (
            <>
              <Card title="Seguimiento">
                <ul className="list-none">
                  <Row
                    label="Adherencia percibida"
                    value={answers.seguimiento.adherenciaPercibida && `${answers.seguimiento.adherenciaPercibida}/5`}
                  />
                  <Row
                    label="Progreso percibido"
                    value={answers.seguimiento.progresoPercibido && `${answers.seguimiento.progresoPercibido}/5`}
                  />
                  <Row label="Qué ha mejorado" value={answers.seguimiento.queHaMejorado} />
                  <Row label="Obstáculos" value={answers.seguimiento.obstaculos} />
                  <Row label="Objetivo del próximo periodo" value={answers.seguimiento.objetivoProximoPeriodo} />
                </ul>
              </Card>
              <Card title="Cierre">
                <ul className="list-none">
                  <Row label="Notas del entrenador" value={answers.cierre.notasEntrenador} />
                </ul>
              </Card>
            </>
          )}

          {customAnswers.length > 0 && (
            <Card title="Preguntas del centro">
              <ul className="list-none">
                {customAnswers.map(({ question, answer }) => (
                  <Row key={question.key} label={question.label} value={String(answer)} />
                ))}
              </ul>
            </Card>
          )}

          {marks.length > 0 && (
            <Card title="Marcas">
              <ul className="list-none">
                {marks.map((m: { key: PerformanceMarkKey; value: number }) => {
                  const mark = PERFORMANCE_MARKS.find((p) => p.key === m.key)!;
                  return <Row key={m.key} label={mark.label} value={`${m.value} ${mark.unit}`} />;
                })}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

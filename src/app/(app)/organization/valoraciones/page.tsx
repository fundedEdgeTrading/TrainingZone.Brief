import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getAssessmentConfig } from "@/lib/assessments/queries";
import {
  CUSTOM_QUESTION_SCOPE_LABEL,
  CUSTOM_QUESTION_TYPE_LABEL,
  STANDARD_QUESTIONS,
  isQuestionEnabled,
} from "@/lib/assessments/config";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { addMilestoneAction, createCustomQuestionAction, updateMilestoneAction } from "./actions";
import { CustomQuestionToggle, QuestionToggle } from "./controls";

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";
const SECTION_TITLE = "font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text";

/**
 * Qué pregunta este centro en sus valoraciones y cada cuánto las pide (F-VAL).
 *
 * Antes eran dos constantes del código: la escalera de hitos y el cuestionario.
 * Aquí se mantienen sin tocar código y sin migración — una organización que no
 * entre nunca a esta pantalla sigue con el cuestionario y los hitos de siempre.
 *
 * Fuera de alcance a propósito: el disparo automático del cron es una
 * limitación de infraestructura ya conocida (GitHub Actions llama a
 * `/api/jobs/run`), así que un hito nuevo se crea el día que el cron pasa, no al
 * minuto de configurarlo. El entrenador siempre puede abrirlo a mano desde la
 * ficha del socio.
 */
export default async function AssessmentsConfigPage() {
  const session = await requireRole(["OWNER"]);
  // La configuración resuelta manda en lo que se enseña; las preguntas propias
  // se releen aquí solo porque esta pantalla necesita su id para retirarlas.
  const [config, customQuestions] = await Promise.all([
    getAssessmentConfig(session.user.orgId),
    prisma.assessmentCustomQuestion.findMany({
      where: { orgId: session.user.orgId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const sections = [...new Set(STANDARD_QUESTIONS.map((q) => q.section))];

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Organización · Valoraciones"
        description="La periodicidad de las revisiones y las preguntas del cuestionario, a la medida del centro. Lo que no se toca aquí se comporta como siempre: los seis hitos de F3 y el cuestionario estándar."
      />

      <section className={CARD}>
        <h2 className={SECTION_TITLE}>Periodicidad</h2>
        <p className="text-sm text-brand-muted mt-1 mb-4">
          Meses desde el alta del socio a los que vence cada revisión. Los hitos estándar se pueden renombrar y mover;
          los que añadas se suman a la escalera por su vencimiento.
        </p>

        <ul className="list-none flex flex-col gap-2">
          {config.milestones.map((milestone) => (
            <li key={milestone.key}>
              <ActionForm
                action={updateMilestoneAction}
                successMessage="Hito actualizado."
                resetOnSuccess={false}
                className="flex flex-wrap items-end gap-3 rounded-control border border-brand-border px-4 py-3"
              >
                <input type="hidden" name="key" value={milestone.key} />
                <Field label="Nombre" className="grow min-w-[220px]">
                  <Input name="label" defaultValue={milestone.label} maxLength={80} required />
                </Field>
                <Field label="Meses" className="w-[110px]">
                  <Input
                    name="months"
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    defaultValue={milestone.months}
                    // La inicial vence el día del alta: sin PAR-Q firmado no hay
                    // valoración, así que su vencimiento no se negocia.
                    disabled={milestone.key === "INITIAL"}
                  />
                </Field>
                <div className="flex items-center gap-2 pb-0.5">
                  <Badge tone={milestone.standard ? "neutral" : "good"}>
                    {milestone.standard ? "Estándar" : "Del centro"}
                  </Badge>
                  <Button type="submit" size="sm" variant="secondary">
                    Guardar
                  </Button>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>

        <ActionForm
          action={addMilestoneAction}
          successMessage="Hito añadido."
          className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end mt-4 pt-4 border-t border-tz-sand"
        >
          <Field label="Nuevo hito" hint="p. ej. una revisión a los 18 meses">
            <Input name="label" placeholder="Revisión · 18 meses" maxLength={80} />
          </Field>
          <Field label="Meses">
            <Input name="months" type="number" min="1" max="120" step="1" placeholder="18" required />
          </Field>
          <Button type="submit">Añadir hito</Button>
        </ActionForm>
      </section>

      <section className={CARD}>
        <h2 className={SECTION_TITLE}>Preguntas del cuestionario</h2>
        <p className="text-sm text-brand-muted mt-1 mb-4">
          Lo que se quita deja de aparecer en el formulario y deja de pedirse al guardar. Las valoraciones ya cerradas
          no cambian: se contestaron con el cuestionario de su día.
        </p>

        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <div key={section}>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">{section}</h3>
              <div>
                {STANDARD_QUESTIONS.filter((q) => q.section === section).map((question) => (
                  <QuestionToggle
                    key={question.key}
                    questionKey={question.key}
                    label={
                      question.scope === "ALL"
                        ? question.label
                        : `${question.label} · ${CUSTOM_QUESTION_SCOPE_LABEL[question.scope]}`
                    }
                    enabled={isQuestionEnabled(config, question.key)}
                    locked={question.locked}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={CARD}>
        <h2 className={SECTION_TITLE}>Preguntas propias</h2>
        <p className="text-sm text-brand-muted mt-1 mb-4">
          Lo que este centro pregunta y el cuestionario estándar no recoge. Se responden en el mismo formulario y
          quedan en la valoración del socio.
        </p>

        {customQuestions.length > 0 && (
          <ul className="list-none flex flex-col gap-2 mb-4">
            {customQuestions.map((question) => (
              <li
                key={question.key}
                className="flex items-center justify-between gap-3 flex-wrap rounded-control border border-brand-border px-4 py-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-brand-text">{question.label}</span>
                  <p className="text-[12px] text-brand-muted mt-0.5">
                    {CUSTOM_QUESTION_TYPE_LABEL[question.type]} · {CUSTOM_QUESTION_SCOPE_LABEL[question.scope]}
                    {question.required ? " · obligatoria" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!question.active && <Badge tone="neutral">Retirada</Badge>}
                  <CustomQuestionToggle id={question.id} label={question.label} active={question.active} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <ActionForm
          action={createCustomQuestionAction}
          successMessage="Pregunta añadida."
          className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end pt-4 border-t border-tz-sand"
        >
          <Field label="Pregunta">
            <Input name="label" placeholder="¿Cuántos cafés al día?" maxLength={200} required />
          </Field>
          <Field label="Tipo de respuesta">
            <Select name="type" defaultValue="TEXT">
              {Object.entries(CUSTOM_QUESTION_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Se pregunta en">
            <Select name="scope" defaultValue="ALL">
              {Object.entries(CUSTOM_QUESTION_SCOPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-brand-text-2">
              <input type="checkbox" name="required" className="w-[15px] h-[15px] accent-tz-black" />
              Obligatoria
            </label>
            <Button type="submit">Añadir pregunta</Button>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}

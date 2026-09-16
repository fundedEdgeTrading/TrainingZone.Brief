"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { FlowActionType, FlowBranch, FlowConditionType, FlowGoalKind, FlowTriggerType } from "@prisma/client";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  FLOW_ACTION_LABEL,
  FLOW_ACTION_STATES,
  FLOW_ACTION_TYPES,
  FLOW_BRANCHES,
  FLOW_BRANCH_LABEL,
  FLOW_CONDITION_LABEL,
  FLOW_CONDITION_TYPES,
  FLOW_GOAL_DEFINITION,
  FLOW_GOAL_LABEL,
  FLOW_GOAL_KINDS,
  FLOW_TRIGGER_LABEL,
  FLOW_TRIGGER_NUMBER,
  FLOW_TRIGGER_SIGNAL,
  FLOW_TRIGGER_STATES,
  FLOW_TRIGGER_STATE_LABEL,
  FLOW_TRIGGER_TYPES,
  PLAN_TYPE_LABEL,
} from "@/lib/flows/catalog";
import { MAX_STEPS_PER_BRANCH, validateFlow } from "@/lib/flows/validate";
import {
  toFlowDraft,
  type FlowConditionRow,
  type FlowEditorOptions,
  type FlowEditorValue,
  type FlowStepRow,
} from "./editor-value";
import { saveFlowAction } from "./actions";

/**
 * E14-28 · EL EDITOR DE CUATRO PIEZAS.
 *
 *     DISPARADOR → CONDICIÓN → ESPERA → ACCIÓN
 *
 * Y NADA MÁS: los cuatro catálogos son enums cerrados, así que aquí no se puede
 * escribir una pieza que el motor no sepa ejecutar.
 *
 * LA VALIDACIÓN DE VERDAD ESTÁ EN EL SERVIDOR (`saveFlow` → `validateFlow`).
 * Este formulario llama a la MISMA función para avisar antes de enviar —es
 * pura, se puede importar aquí— pero no es la garantía: un `fetch` a mano se
 * salta el formulario entero y no se salta la acción de servidor.
 */

export function FlowEditor({
  options,
  initial,
  flowId,
}: {
  options: FlowEditorOptions;
  initial: FlowEditorValue;
  flowId?: string;
}) {
  const [value, setValue] = useState<FlowEditorValue>(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const draft = useMemo(() => toFlowDraft(value), [value]);
  const validation = useMemo(() => validateFlow(draft), [draft]);
  const issues = validation.ok ? [] : validation.issues;

  const patch = (partial: Partial<FlowEditorValue>) => setValue((v) => ({ ...v, ...partial }));

  const patchStep = (index: number, partial: Partial<FlowStepRow>) =>
    setValue((v) => ({ ...v, steps: v.steps.map((s, i) => (i === index ? { ...s, ...partial } : s)) }));

  const patchCondition = (index: number, partial: Partial<FlowConditionRow>) =>
    setValue((v) => ({ ...v, conditions: v.conditions.map((c, i) => (i === index ? { ...c, ...partial } : c)) }));

  const save = () =>
    startTransition(async () => {
      const result = await saveFlowAction(draft, flowId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(flowId ? "Flujo guardado." : "Flujo creado, en borrador.");
      router.push(`/flujos/${result.id ?? flowId}`);
      router.refresh();
    });

  const numberSpec = FLOW_TRIGGER_NUMBER[value.triggerType];
  const mainCount = value.steps.filter((s) => s.branch === "MAIN").length;

  return (
    <div className="space-y-5" data-testid="flow-editor">
      {/* ------------------------------------------------- nombre y centro */}
      <Section title="El flujo" subtitle="Un flujo es de UN centro: los horarios, el remitente y la sala de la que habla el correo son los suyos.">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
          <Field label="Nombre">
            <Input value={value.name} onChange={(e) => patch({ name: e.target.value })} placeholder="p. ej. Bienvenida" required />
          </Field>
          <Field label="Centro">
            <Select value={value.centerId} onChange={(e) => patch({ centerId: e.target.value })}>
              {options.centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Para qué es" hint="Se ve en el listado. Que el de dentro de seis meses sepa por qué existe.">
          <Input value={value.description} onChange={(e) => patch({ description: e.target.value })} />
        </Field>
      </Section>

      {/* ------------------------------------------------------ DISPARADOR */}
      <Section title="1 · Disparador" subtitle="Qué mete a un socio en el flujo. Ninguna de estas señales se recalcula aquí: se leen de donde ya viven.">
        <Field label="Entra cuando" hint={FLOW_TRIGGER_SIGNAL[value.triggerType]}>
          <Select
            value={value.triggerType}
            onChange={(e) => patch({ triggerType: e.target.value as FlowTriggerType, triggerConfig: {} })}
          >
            {FLOW_TRIGGER_TYPES.map((t) => (
              <option key={t} value={t}>
                {FLOW_TRIGGER_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        {numberSpec && (
          <Field label={numberSpec.label} hint={`Entre ${numberSpec.min} y ${numberSpec.max}.`}>
            <Input
              type="number"
              min={numberSpec.min}
              max={numberSpec.max}
              value={String(value.triggerConfig[numberSpec.field] ?? numberSpec.fallback)}
              onChange={(e) =>
                patch({ triggerConfig: { ...value.triggerConfig, [numberSpec.field]: Number(e.target.value) } })
              }
            />
          </Field>
        )}

        {value.triggerType === "MEMBER_STATE_CHANGED" && (
          <Field label="Pasa a ser" hint="La transición la escribe member-lifecycle.ts, que es el punto único: aquí solo se escucha.">
            <Select
              value={String(value.triggerConfig.state ?? "")}
              onChange={(e) => patch({ triggerConfig: { ...value.triggerConfig, state: e.target.value } })}
            >
              <option value="">Elige un estado…</option>
              {FLOW_TRIGGER_STATES.map((s) => (
                <option key={s} value={s}>
                  {FLOW_TRIGGER_STATE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Section>

      {/* -------------------------------------------------------- CONDICIÓN */}
      <Section
        title="2 · Condición"
        subtitle="Se cumplen TODAS a la vez. Si necesitas un «o», eso son dos flujos — y así el editor sigue teniendo cuatro piezas."
      >
        {value.conditions.length === 0 && (
          <p className="text-[13px] text-brand-muted">Sin condiciones: entra todo el que dispare.</p>
        )}
        {value.conditions.map((cond, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto_auto] gap-3 items-end">
            <Field label="Condición">
              <Select
                value={cond.type}
                onChange={(e) => patchCondition(index, { type: e.target.value as FlowConditionType, config: {} })}
              >
                {FLOW_CONDITION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FLOW_CONDITION_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <ConditionConfig cond={cond} options={options} onChange={(config) => patchCondition(index, { config })} />
            <label className="flex items-center gap-2 text-[13px] text-brand-muted pb-2">
              <input
                type="checkbox"
                checked={cond.negated}
                onChange={(e) => patchCondition(index, { negated: e.target.checked })}
              />
              Al revés (NO)
            </label>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => patch({ conditions: value.conditions.filter((_, i) => i !== index) })}
            >
              Quitar
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => patch({ conditions: [...value.conditions, { type: "TAG", config: {}, negated: false }] })}
        >
          + Condición
        </Button>
      </Section>

      {/* ------------------------------------------------ ESPERA → ACCIÓN */}
      <Section
        title="3 y 4 · Espera → acción"
        subtitle="Cada paso es una espera en días y una acción. La espera se cuenta desde que se ejecutó el paso anterior, y nada sale entre las 22:00 y las 8:00 del centro."
      >
        {value.steps.map((step, index) => (
          <StepCard
            key={index}
            index={index}
            step={step}
            options={options}
            onChange={(partial) => patchStep(index, partial)}
            onRemove={
              value.steps.length > 1
                ? () => patch({ steps: value.steps.filter((_, i) => i !== index) })
                : undefined
            }
          />
        ))}
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={mainCount >= MAX_STEPS_PER_BRANCH}
          onClick={() =>
            patch({
              steps: [
                ...value.steps,
                { branch: "MAIN", waitDays: 1, actionType: "SEND_EMAIL", actionConfig: {}, branchAfterDays: null },
              ],
            })
          }
        >
          + Paso
        </Button>
      </Section>

      {/* ------------------------------------------------------- OBJETIVO */}
      <Section
        title="Objetivo"
        subtitle="La tercera cifra del panel. Se mide contra datos que ya existen; si el flujo no tiene un objetivo medible, es mejor dejarlo vacío que fingirlo."
      >
        <Field label="Cumple el objetivo cuando" hint={value.goalKind ? FLOW_GOAL_DEFINITION[value.goalKind] : undefined}>
          <Select value={value.goalKind} onChange={(e) => patch({ goalKind: e.target.value as FlowGoalKind | "" })}>
            <option value="">Sin objetivo definido</option>
            {FLOW_GOAL_KINDS.map((g) => (
              <option key={g} value={g}>
                {FLOW_GOAL_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      {/* --------------------------------------------------------- guardar */}
      {issues.length > 0 && (
        <ul data-testid="flow-editor-errores" className="rounded-card border border-critical bg-critical-bg p-4 text-[13px] text-critical space-y-1 list-disc pl-8">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" disabled={pending} onClick={save}>
          {pending && <ButtonSpinner />}
          {flowId ? "Guardar cambios" : "Crear flujo"}
        </Button>
        <p className="text-[13px] text-brand-muted">
          {flowId
            ? "Guardar no enciende nada: el estado se cambia desde el listado."
            : "Nace en borrador: se ejecuta de verdad, pero escribe al email de pruebas."}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card space-y-3">
      <div>
        <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">{title}</h2>
        <p className="text-[13px] text-brand-muted mt-1">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ConditionConfig({
  cond,
  options,
  onChange,
}: {
  cond: FlowConditionRow;
  options: FlowEditorOptions;
  onChange: (config: Record<string, unknown>) => void;
}) {
  switch (cond.type) {
    case "TAG":
      return (
        <Field label="Etiqueta" hint="Se guarda la CLAVE: renombrar la etiqueta no deja el flujo apuntando a nada.">
          <Select value={String(cond.config.tagKey ?? "")} onChange={(e) => onChange({ tagKey: e.target.value })}>
            <option value="">Elige una etiqueta…</option>
            {options.tags.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "CENTER":
      return (
        <Field label="Centro">
          <Select
            value={String((cond.config.centerIds as string[] | undefined)?.[0] ?? "")}
            onChange={(e) => onChange({ centerIds: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Elige un centro…</option>
            {options.centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "PLAN_TYPE":
      return (
        <Field label="Tipo de plan">
          <Select
            value={String((cond.config.planTypes as string[] | undefined)?.[0] ?? "")}
            onChange={(e) => onChange({ planTypes: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Elige un tipo…</option>
            {Object.entries(PLAN_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "TENURE":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Antigüedad">
            <Select
              value={String(cond.config.direction ?? "min")}
              onChange={(e) => onChange({ ...cond.config, direction: e.target.value })}
            >
              <option value="min">Al menos</option>
              <option value="max">Como mucho</option>
            </Select>
          </Field>
          <Field label="Meses">
            <Input
              type="number"
              min={0}
              max={240}
              value={String(cond.config.months ?? 6)}
              onChange={(e) => onChange({ ...cond.config, months: Number(e.target.value) })}
            />
          </Field>
        </div>
      );
    case "TRAINER":
      return (
        <Field label="Entrenador">
          <Select
            value={String((cond.config.trainerUserIds as string[] | undefined)?.[0] ?? "")}
            onChange={(e) => onChange({ trainerUserIds: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Elige un entrenador…</option>
            {options.trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    default:
      return null;
  }
}

function StepCard({
  index,
  step,
  options,
  onChange,
  onRemove,
}: {
  index: number;
  step: FlowStepRow;
  options: FlowEditorOptions;
  onChange: (partial: Partial<FlowStepRow>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="border border-brand-border rounded-card p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr_auto] gap-3 items-end">
        <Field label="Rama">
          <Select value={step.branch} onChange={(e) => onChange({ branch: e.target.value as FlowBranch })}>
            {FLOW_BRANCHES.map((b) => (
              <option key={b} value={b}>
                {FLOW_BRANCH_LABEL[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Esperar (días)">
          <Input
            type="number"
            min={0}
            max={365}
            value={String(step.waitDays)}
            onChange={(e) => onChange({ waitDays: Number(e.target.value) })}
          />
        </Field>
        <Field label="Acción">
          <Select
            value={step.actionType}
            onChange={(e) => onChange({ actionType: e.target.value as FlowActionType, actionConfig: {} })}
          >
            {FLOW_ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {FLOW_ACTION_LABEL[a]}
              </option>
            ))}
          </Select>
        </Field>
        {onRemove ? (
          <Button variant="secondary" size="sm" type="button" onClick={onRemove}>
            Quitar paso
          </Button>
        ) : (
          <span className="text-[12px] text-brand-muted pb-2">Paso {index + 1}</span>
        )}
      </div>

      {/* «Si responde» y «si no responde» no tienen señal automática hoy y el
          editor lo dice donde se elige, no en una nota al pie. */}
      {(step.branch === "ON_REPLY" || step.branch === "ON_NO_REPLY") && (
        <p className="text-[12px] text-warning-text bg-warning-bg rounded-card px-3 py-2">
          Ojo: hoy no hay forma automática de saber si un socio ha respondido — su respuesta llega al buzón del centro,
          no aquí. Mientras nadie marque la respuesta a mano, «si no responde» se cumple para todo el mundo. La rama que
          sí funciona sola es <strong>«si hace clic»</strong>.
        </p>
      )}

      {step.branch === "ON_NO_REPLY" && (
        <Field label="Se da por no respondida a los (días)">
          <Input
            type="number"
            min={1}
            max={90}
            value={String(step.branchAfterDays ?? 3)}
            onChange={(e) => onChange({ branchAfterDays: Number(e.target.value) })}
          />
        </Field>
      )}

      <StepActionConfig step={step} options={options} onChange={(actionConfig) => onChange({ actionConfig })} />
    </div>
  );
}

function StepActionConfig({
  step,
  options,
  onChange,
}: {
  step: FlowStepRow;
  options: FlowEditorOptions;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const config = step.actionConfig;
  const set = (partial: Record<string, unknown>) => onChange({ ...config, ...partial });

  switch (step.actionType) {
    case "SEND_EMAIL":
      return (
        <div className="space-y-3">
          <Field label="Asunto">
            <Input value={String(config.subject ?? "")} onChange={(e) => set({ subject: e.target.value })} />
          </Field>
          <Field
            label="Cuerpo"
            hint="Texto llano. Una línea en blanco separa párrafos. El pie con el enlace de baja lo pone la plantilla."
          >
            <Textarea rows={5} value={String(config.bodyText ?? "")} onChange={(e) => set({ bodyText: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Botón (opcional)" hint="El enlace es nuestro: por eso se puede medir el clic sin píxel de traza.">
              <Input value={String(config.ctaLabel ?? "")} onChange={(e) => set({ ctaLabel: e.target.value })} />
            </Field>
            <Field label="A dónde lleva">
              <Input
                value={String(config.ctaPath ?? "/portal")}
                onChange={(e) => set({ ctaPath: e.target.value })}
                placeholder="/portal"
              />
            </Field>
          </div>
        </div>
      );
    case "SEND_FORM":
      return (
        <Field label="Formulario" hint="Es el formulario del socio que ya existe: se le manda con su enlace y su caducidad.">
          <Select value={String(config.milestoneKey ?? "")} onChange={(e) => set({ milestoneKey: e.target.value })}>
            <option value="">Elige un formulario…</option>
            {options.milestones.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "ADD_TAG":
    case "REMOVE_TAG":
      return (
        <Field
          label="Etiqueta"
          hint="Solo etiquetas manuales: las automáticas las pone y las quita el sistema, y un flujo que las tocara se pelearía con él."
        >
          <Select value={String(config.tagKey ?? "")} onChange={(e) => set({ tagKey: e.target.value })}>
            <option value="">Elige una etiqueta…</option>
            {options.tags
              .filter((t) => t.kind === "MANUAL")
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
          </Select>
        </Field>
      );
    case "CREATE_TASK":
      return (
        <div className="space-y-3">
          <Field label="Título de la tarea">
            <Input value={String(config.title ?? "")} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Para quién" hint="Vacío = el entrenador con el que de hecho entrena el socio.">
              <Select value={String(config.trainerUserId ?? "")} onChange={(e) => set({ trainerUserId: e.target.value })}>
                <option value="">Su entrenador</option>
                {options.trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Para dentro de (días)">
              <Input
                type="number"
                min={0}
                max={365}
                value={String(config.dueInDays ?? 2)}
                onChange={(e) => set({ dueInDays: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      );
    case "CHANGE_STATE":
      return (
        <Field label="Pasa a" hint="La transición pasa por el punto único de escritura y deja traza, como si la hiciera una persona.">
          <Select value={String(config.state ?? "")} onChange={(e) => set({ state: e.target.value })}>
            <option value="">Elige un estado…</option>
            {FLOW_ACTION_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "NOTIFY_DIRECTOR":
      return (
        <Field label="Qué se le dice a dirección">
          <Input value={String(config.title ?? "")} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      );
    default:
      return null;
  }
}

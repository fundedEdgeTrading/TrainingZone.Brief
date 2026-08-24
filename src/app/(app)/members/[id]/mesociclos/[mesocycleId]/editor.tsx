"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { BrandLoader, MESOCYCLE_REFINE_STEPS, usePacedLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { MesocycleDetail } from "@/lib/mesocycle-queries";
import { MESOCYCLE_STATUS_LABEL, MESOCYCLE_STATUS_TONE } from "../panel";
import {
  approveMesocycleAction,
  archiveMesocycleAction,
  deleteMesocycleExerciseAction,
  refineMesocycleAction,
  updateMesocycleDayAction,
  updateMesocycleExerciseAction,
  updateMesocycleHeaderAction,
  updateMesocyclePhaseAction,
  type MesocycleActionResult,
} from "../actions";

/**
 * Duración esperada del refinado (una sola llamada al modelo, sin la ficha ni
 * el guardado completo de la generación). Solo reparte los pasos por la barra.
 */
const EXPECTED_REFINE_MS = 55_000;

type Phase = MesocycleDetail["phases"][number];
type Day = Phase["days"][number];
type Exercise = Day["blocks"][number]["exercises"][number];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function milestones(value: unknown): { week: number; milestone: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { week, milestone } = entry as Record<string, unknown>;
    return typeof week === "number" && typeof milestone === "string" ? [{ week, milestone }] : [];
  });
}

/** Todas las escrituras del editor comparten el mismo aviso de resultado. */
function useAction() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<MesocycleActionResult>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });
  }

  return { pending, run };
}

export function MesocycleEditor({
  memberId,
  mesocycle,
  aiConfigured,
}: {
  memberId: string;
  mesocycle: MesocycleDetail;
  aiConfigured: boolean;
}) {
  return (
    <div className="space-y-6">
      <MesocycleHeaderCard memberId={memberId} mesocycle={mesocycle} />
      <RefineCard memberId={memberId} mesocycleId={mesocycle.id} aiConfigured={aiConfigured} />
      {mesocycle.phases.map((phase) => (
        <PhaseCard key={phase.id} memberId={memberId} mesocycleId={mesocycle.id} phase={phase} />
      ))}
    </div>
  );
}

function MesocycleHeaderCard({ memberId, mesocycle }: { memberId: string; mesocycle: MesocycleDetail }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState(mesocycle.title);
  const [objective, setObjective] = useState(mesocycle.objective);
  const [safety, setSafety] = useState(strings(mesocycle.safetyCriteria).join("\n"));

  return (
    <section className="border border-brand-border rounded-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Badge tone={MESOCYCLE_STATUS_TONE[mesocycle.status]}>{MESOCYCLE_STATUS_LABEL[mesocycle.status]}</Badge>
        <div className="flex gap-2">
          {mesocycle.status === "DRAFT" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => approveMesocycleAction(memberId, mesocycle.id), "Mesociclo aprobado.")}
            >
              Aprobar mesociclo
            </Button>
          )}
          {mesocycle.status !== "ARCHIVED" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => archiveMesocycleAction(memberId, mesocycle.id), "Mesociclo archivado.")}
            >
              Archivar
            </Button>
          )}
        </div>
      </div>

      {mesocycle.status === "DRAFT" && (
        <p className="text-xs text-brand-muted">
          Borrador generado por IA: no es un plan válido hasta que lo apruebes. Cualquier cambio posterior
          devuelve el mesociclo a borrador y hay que volver a aprobarlo.
        </p>
      )}

      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Objetivo">
        <Textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} />
      </Field>
      <Field label="Criterios de seguridad" hint="Lo que NO se puede programar. Uno por línea.">
        <Textarea rows={3} value={safety} onChange={(e) => setSafety(e.target.value)} />
      </Field>

      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run(
            () => updateMesocycleHeaderAction(memberId, mesocycle.id, { title, objective, safetyCriteria: safety }),
            "Cabecera guardada."
          )
        }
      >
        Guardar cabecera
      </Button>

      <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-brand-border">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">Semana tipo</h4>
          <ul className="text-sm space-y-1">
            {strings(mesocycle.weeklyLayout).map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">Hoja de ruta</h4>
          <ul className="text-sm space-y-1">
            {milestones(mesocycle.milestones).map((m, i) => (
              <li key={i}>
                <span className="text-brand-muted">Semana {m.week}:</span> {m.milestone}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * La otra espera larga con IA de la app: una sola llamada al modelo que
 * reescribe el plan entero. Como la generación, se tapa con el loader de marca
 * en vez de dejar un botón en «Refinando...» durante casi un minuto.
 */
function RefineCard({
  memberId,
  mesocycleId,
  aiConfigured,
}: {
  memberId: string;
  mesocycleId: string;
  aiConfigured: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const loader = usePacedLoader(MESOCYCLE_REFINE_STEPS, EXPECTED_REFINE_MS);

  function refine() {
    loader.start();

    startTransition(async () => {
      const result = await refineMesocycleAction(memberId, mesocycleId, request);

      if (!result.ok) {
        loader.abort();
        toast.error(result.error);
        return;
      }

      setRequest("");
      loader.finish(() => toast.success("Plan refinado. Vuelve a revisarlo antes de aprobarlo."));
    });
  }

  return (
    <section className="border border-brand-border rounded-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Refinar con IA</h3>
        <p className="text-xs text-brand-muted mt-1">
          Pídelo en lenguaje natural («cambia la fase 2, no me gusta el broad jump»). Solo cambia lo que pidas;
          el resto del plan se mantiene tal cual.
        </p>
      </div>
      <Textarea rows={3} value={request} onChange={(e) => setRequest(e.target.value)} disabled={!aiConfigured} />
      <Button size="sm" disabled={pending || loader.loading || !aiConfigured} onClick={refine}>
        {pending || loader.loading ? "Refinando..." : "Pedir cambio"}
      </Button>

      {loader.loading && (
        <BrandLoader
          steps={MESOCYCLE_REFINE_STEPS}
          step={loader.step}
          done={loader.done}
          title="Refinando mesociclo"
          doneLabel="Plan refinado"
          hint="Suele tardar cerca de un minuto. No cierres esta ventana."
        />
      )}
    </section>
  );
}

function PhaseCard({ memberId, mesocycleId, phase }: { memberId: string; mesocycleId: string; phase: Phase }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(phase.name);
  const [notes, setNotes] = useState(phase.notes ?? "");

  return (
    <section className="border border-brand-border rounded-card p-4 space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <Field label={`Fase ${phase.order + 1} · semanas ${phase.weekFrom}-${phase.weekTo}`} className="flex-1 min-w-[220px]">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(() => updateMesocyclePhaseAction(memberId, mesocycleId, phase.id, { name, notes }), "Fase guardada.")
          }
        >
          Guardar fase
        </Button>
      </div>
      <Field label="Notas de la fase">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {phase.days.map((day) => (
        <DayCard key={day.id} memberId={memberId} mesocycleId={mesocycleId} day={day} />
      ))}
    </section>
  );
}

function DayCard({ memberId, mesocycleId, day }: { memberId: string; mesocycleId: string; day: Day }) {
  const { pending, run } = useAction();
  const [focus, setFocus] = useState(day.focus);
  const [venue, setVenue] = useState(day.venue);
  const [warmup, setWarmup] = useState(strings(day.warmup).join("\n"));

  return (
    <div className="border border-brand-border rounded-lg p-3 space-y-3 bg-tz-bone/40">
      <h4 className="text-sm font-semibold">{day.label}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Foco">
          <Input value={focus} onChange={(e) => setFocus(e.target.value)} />
        </Field>
        <Field label="Dónde entrena">
          <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
      </div>
      <Field label="Calentamiento" hint="Un movimiento por línea.">
        <Textarea rows={3} value={warmup} onChange={(e) => setWarmup(e.target.value)} />
      </Field>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run(
            () => updateMesocycleDayAction(memberId, mesocycleId, day.id, { focus, venue, warmup }),
            "Día guardado."
          )
        }
      >
        Guardar día
      </Button>

      {day.blocks.map((block) => (
        <div key={block.id} className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">
            {block.name} · {block.durationMin} min
          </p>
          {block.exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} memberId={memberId} mesocycleId={mesocycleId} exercise={exercise} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ExerciseCard({
  memberId,
  mesocycleId,
  exercise,
}: {
  memberId: string;
  mesocycleId: string;
  exercise: Exercise;
}) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(String(exercise.sets));
  const [reps, setReps] = useState(exercise.reps);
  const [load, setLoad] = useState(exercise.load ?? "");
  const [description, setDescription] = useState(exercise.description);
  const [rationale, setRationale] = useState(exercise.rationale);

  return (
    <div className="border border-brand-border rounded-lg bg-white p-3 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <span className="font-semibold">{exercise.name}</span>{" "}
        <span className="text-brand-muted">
          {exercise.sets} × {exercise.reps}
          {exercise.load && ` · ${exercise.load}`}
        </span>
      </button>

      {!open && <p className="text-xs text-brand-muted mt-1">{exercise.rationale}</p>}

      {open && (
        <div className="space-y-3 mt-3">
          <Field label="Ejercicio">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Series">
              <Input type="number" min={1} value={sets} onChange={(e) => setSets(e.target.value)} />
            </Field>
            <Field label="Repeticiones">
              <Input value={reps} onChange={(e) => setReps(e.target.value)} />
            </Field>
            <Field label="Carga">
              <Input value={load} onChange={(e) => setLoad(e.target.value)} />
            </Field>
          </div>
          <Field label="Ejecución">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Por qué este ejercicio" hint="Obligatorio: es lo que separa el mesociclo de una plantilla.">
            <Textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateMesocycleExerciseAction(memberId, mesocycleId, exercise.id, {
                      name,
                      sets: Number(sets),
                      reps,
                      load,
                      description,
                      rationale,
                    }),
                  "Ejercicio guardado."
                )
              }
            >
              Guardar ejercicio
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteMesocycleExerciseAction(memberId, mesocycleId, exercise.id),
                  "Ejercicio eliminado."
                )
              }
            >
              Eliminar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

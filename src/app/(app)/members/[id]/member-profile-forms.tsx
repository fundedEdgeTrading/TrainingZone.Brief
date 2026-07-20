"use client";

import { useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  assignClientGoalAction,
  markClientGoalAchievedAction,
  addClientGoalTemplateAction,
  setMemberTrainerAction,
} from "../actions";

type Goal = { id: string; label: string; achievedAt: Date | null; createdAt: Date };

export function ClientGoalsPanel({
  memberId,
  goals,
  templates,
}: {
  memberId: string;
  goals: Goal[];
  templates: { id: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [custom, setCustom] = useState("");

  function assign(label: string) {
    if (!label.trim()) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("memberId", memberId);
      fd.set("label", label);
      const result = await assignClientGoalAction(fd);
      if (result.ok) {
        toast.success("Objetivo asignado");
        setCustom("");
      } else toast.error(result.error);
    });
  }

  function markAchieved(goalId: string) {
    startTransition(async () => {
      const result = await markClientGoalAchievedAction(goalId, memberId);
      if (result.ok) toast.success("¡Objetivo conseguido!");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2 flex-wrap">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={pending}
            onClick={() => assign(t.label)}
            className="text-xs font-semibold rounded-pill border border-brand-border bg-white px-3 py-1.5 hover:border-brand-ink transition-colors"
          >
            + {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Objetivo personalizado..." className="flex-1" />
        <Button size="sm" disabled={pending || !custom.trim()} onClick={() => assign(custom)}>
          Añadir
        </Button>
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin objetivos asignados todavía.</p>
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 border border-brand-border rounded-lg p-3 text-sm">
              <span className={g.achievedAt ? "line-through text-brand-muted" : "text-brand-text"}>{g.label}</span>
              {g.achievedAt ? (
                <span className="text-xs text-good font-semibold shrink-0">Conseguido {g.achievedAt.toLocaleDateString("es-ES")}</span>
              ) : (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => markAchieved(g.id)}>
                  Marcar conseguido
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GoalTemplateForm() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await addClientGoalTemplateAction(fd);
          if (result.ok) toast.success("Añadido al catálogo");
          else toast.error(result.error);
        })
      }
      className="flex gap-2 max-w-md"
    >
      <Input name="label" placeholder="Nuevo objetivo de catálogo..." className="flex-1" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Añadir al catálogo
      </Button>
    </form>
  );
}

export function TrainerAssignSelect({
  memberId,
  trainerId,
  trainers,
}: {
  memberId: string;
  trainerId: string | null;
  trainers: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [value, setValue] = useState(trainerId ?? "");

  return (
    <Field label="Entrenador responsable (EP/online)" hint="Cliente de solo grupos → responsable Training Zone (sin asignar)">
      <div className="flex gap-2">
        <Select value={value} onChange={(e) => setValue(e.target.value)} className="flex-1">
          <option value="">— Training Zone (sin asignar) —</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setMemberTrainerAction(memberId, value);
              if (result.ok) toast.success("Entrenador actualizado");
              else toast.error(result.error);
            })
          }
        >
          Guardar
        </Button>
      </div>
    </Field>
  );
}

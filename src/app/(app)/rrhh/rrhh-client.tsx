"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { updateCheckinConfigAction } from "./actions";

const KIND_LABEL: Record<string, string> = { GROUP: "Grupos", PERSONAL_TRAINING: "Personal Training", ONLINE: "Online" };

export function CheckinConfigForm({
  config,
}: {
  config: { serviceKind: string; goalCheckinDays: number; trainerRatingDays: number };
}) {
  return (
    <ActionForm action={updateCheckinConfigAction} successMessage="Intervalo actualizado" resetOnSuccess={false} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
      <input type="hidden" name="serviceKind" value={config.serviceKind} />
      <Field label={KIND_LABEL[config.serviceKind]}>
        <span className="text-xs text-brand-muted">Objetivos / Valoración (días)</span>
      </Field>
      <Field label="Check-in objetivos">
        <Input name="goalCheckinDays" type="number" min={1} defaultValue={config.goalCheckinDays} />
      </Field>
      <div className="flex gap-2">
        <Input name="trainerRatingDays" type="number" min={1} defaultValue={config.trainerRatingDays} />
        <Button type="submit" size="sm">
          Guardar
        </Button>
      </div>
    </ActionForm>
  );
}

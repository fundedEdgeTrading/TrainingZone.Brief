"use client";

import { Card } from "@/components/kpi-card";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { addLeadChannelAction, addNoCloseReasonAction } from "./actions";

/** RB-LEAD-004/011: listas configurables por dirección sin desplegar código. */
export function LeadConfigPanel({
  channels,
  reasons,
}: {
  channels: { id: string; label: string }[];
  reasons: { id: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card title="Canales de origen" meta="editable sin desplegar">
        <ul className="text-sm text-brand-text-2 space-y-1 mb-3">
          {channels.map((c) => (
            <li key={c.id}>· {c.label}</li>
          ))}
        </ul>
        <ActionForm action={addLeadChannelAction} successMessage="Canal añadido" className="flex gap-2">
          <Input name="label" placeholder="Nuevo canal..." className="flex-1" />
          <Button type="submit" size="sm">
            Añadir
          </Button>
        </ActionForm>
      </Card>
      <Card title="Motivos de no cierre" meta="editable sin desplegar">
        <ul className="text-sm text-brand-text-2 space-y-1 mb-3">
          {reasons.map((r) => (
            <li key={r.id}>· {r.label}</li>
          ))}
        </ul>
        <ActionForm action={addNoCloseReasonAction} successMessage="Motivo añadido" className="flex gap-2">
          <Input name="label" placeholder="Nuevo motivo..." className="flex-1" />
          <Button type="submit" size="sm">
            Añadir
          </Button>
        </ActionForm>
      </Card>
    </div>
  );
}

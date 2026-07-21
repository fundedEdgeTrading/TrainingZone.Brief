"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { useToast } from "@/components/ui/toast";
import {
  updateLeadStageAction,
  assignLeadOwnerAction,
  markLeadNoCloseAction,
  addLeadNoteAction,
  convertLeadAction,
} from "../actions";

export function StageButtons({ leadId, status }: { leadId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function moveTo(next: "SEGUIMIENTO" | "CON_FECHA_VALORACION") {
    startTransition(async () => {
      const result = await updateLeadStageAction(leadId, next);
      if (result.ok) toast.success("Estado actualizado");
      else toast.error(result.error);
    });
  }

  if (status !== "SIN_CONTACTAR" && status !== "SEGUIMIENTO") return null;

  return (
    <div className="flex gap-2">
      {status === "SIN_CONTACTAR" && (
        <Button size="sm" disabled={pending} onClick={() => moveTo("SEGUIMIENTO")}>
          Marcar en seguimiento
        </Button>
      )}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => moveTo("CON_FECHA_VALORACION")}>
        Fijar cita de valoración
      </Button>
    </div>
  );
}

export function OwnerAssignForm({ leadId, staff, ownerUserId }: { leadId: string; staff: { id: string; name: string }[]; ownerUserId: string | null }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [value, setValue] = useState(ownerUserId ?? "");

  return (
    <div className="flex items-end gap-2">
      <Field label="Responsable" className="flex-1">
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Sin asignar</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        size="sm"
        disabled={pending || !value}
        onClick={() =>
          startTransition(async () => {
            const result = await assignLeadOwnerAction(leadId, value);
            if (result.ok) toast.success("Responsable asignado");
            else toast.error(result.error);
          })
        }
      >
        Asignar
      </Button>
    </div>
  );
}

export function NoCloseForm({ leadId, reasons }: { leadId: string; reasons: { id: string; label: string }[] }) {
  return (
    <ActionForm action={markLeadNoCloseAction} successMessage="Lead archivado como no cerrado" className="flex items-end gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Field label="Motivo de no cierre (obligatorio)" className="flex-1">
        <Select name="noCloseReason" required defaultValue="">
          <option value="" disabled>
            Selecciona un motivo...
          </option>
          {reasons.map((r) => (
            <option key={r.id} value={r.label}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="danger" size="sm">
        Archivar
      </Button>
    </ActionForm>
  );
}

export function LeadNoteForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={addLeadNoteAction} successMessage="Nota añadida" className="flex gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Input name="body" placeholder="Añadir una nota..." className="flex-1" />
      <Button type="submit" size="sm">
        Añadir
      </Button>
    </ActionForm>
  );
}

export function ConvertLeadForm({
  leadId,
  plans,
  trainers,
}: {
  leadId: string;
  plans: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={convertLeadAction} successMessage="Alta iniciada: socio creado en periodo de prueba" className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan inicial">
          <Select name="planId" defaultValue="">
            <option value="">— Sin plan —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Entrenador responsable (EP/online)">
          <Select name="trainerId" defaultValue="">
            <option value="">— Sin asignar —</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" className="w-full">
        Iniciar alta como socio
      </Button>
      <p className="text-xs text-brand-muted">
        RB-LEAD-005: el lead pasa a <strong>CERRADO</strong> automáticamente cuando se confirme el primer cobro (Stripe o
        cobro registrado en Cobros).
      </p>
    </ActionForm>
  );
}

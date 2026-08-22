"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { useToast } from "@/components/ui/toast";
import type { LeadCloseType } from "@prisma/client";
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
    <div className="flex flex-wrap gap-2">
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
    <div className="flex flex-wrap items-end gap-2">
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
    <ActionForm action={markLeadNoCloseAction} successMessage="Lead archivado como no cerrado" className="flex flex-wrap items-end gap-2">
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

const CLOSE_TYPE_OPTIONS: { value: LeadCloseType; label: string; activeClass: string }[] = [
  { value: "EMBUDO", label: "Embudo", activeClass: "bg-neutral-bg text-neutral" },
  { value: "DIRECTO", label: "Directo", activeClass: "bg-trial-bg text-trial" },
  { value: "ONLINE", label: "Online", activeClass: "bg-gold-bg text-gold" },
];

const SUBMIT_LABEL: Record<LeadCloseType, string> = {
  EMBUDO: "Cerrar como Embudo · iniciar alta",
  DIRECTO: "Cerrar como Directo · iniciar alta",
  ONLINE: "Cerrar como Online · iniciar alta",
};

export function ConvertLeadForm({
  leadId,
  plans,
}: {
  leadId: string;
  plans: { id: string; name: string }[];
}) {
  const [closeType, setCloseType] = useState<LeadCloseType>("EMBUDO");

  return (
    <ActionForm
      action={convertLeadAction}
      successMessage="Alta iniciada: socio creado en periodo de prueba"
      // Lead cerrado: uno de los cuatro hitos que se celebran.
      celebrateOnSuccess
      className="space-y-3"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="closeType" value={closeType} />
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">Tipo de cierre</label>
        <div className="flex gap-1.5">
          {CLOSE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCloseType(opt.value)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 ${
                closeType === opt.value ? `border-transparent ${opt.activeClass}` : "border-brand-border bg-white text-brand-text-2"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
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
      </div>
      <Button type="submit" className="w-full">
        {SUBMIT_LABEL[closeType]}
      </Button>
      <p className="text-xs text-brand-muted">
        <strong>Embudo</strong>: cierre tras seguimiento normal. <strong>Directo</strong>: alta presencial ya cerrada. <strong>Online</strong>: compra
        por web, sin responsable. RB-LEAD-005: el lead pasa a <strong>CERRADO</strong> automáticamente cuando se confirme el primer cobro
        (Stripe o cobro registrado en Cobros).
      </p>
    </ActionForm>
  );
}

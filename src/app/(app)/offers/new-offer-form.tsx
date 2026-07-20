"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { createManualOfferAction } from "./actions";

export function NewOfferForm({ members }: { members: { id: string; firstName: string; lastName: string }[] }) {
  return (
    <ActionForm action={createManualOfferAction} successMessage="Oferta propuesta a dirección" className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
      <Field label="Socio">
        <Select name="memberId" required defaultValue="">
          <option value="" disabled>
            Seleccionar...
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Descripción de la oferta">
        <Input name="description" required placeholder="2 días/semana con 20% dto. el primer mes..." />
      </Field>
      <div className="flex items-end">
        <Button type="submit" size="sm">
          Proponer
        </Button>
      </div>
    </ActionForm>
  );
}

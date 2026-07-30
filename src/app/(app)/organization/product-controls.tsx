"use client";

import { useState } from "react";
import type { MembershipPlan, PlanType } from "@prisma/client";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { updateMembershipPlan } from "./actions";

const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  MONTHLY: "Cuota mensual",
  SESSION_PACK: "Bono de sesiones",
  DROP_IN: "Sesión suelta",
  PERSONAL_TRAINING: "Entrenamiento personal",
  DUO: "Dúo",
  ONLINE: "Online",
};

/**
 * Edición en un panel lateral, en la línea de la ficha de socio. El aviso sobre
 * el precio no es decorativo: cambiar el importe de un producto con
 * suscripciones vivas creará un precio nuevo en Stripe y las existentes
 * conservarán el anterior (RB-VENTA-002).
 */
export function EditPlanDrawer({ plan }: { plan: MembershipPlan }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Editar
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-tz-black/40" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md h-full bg-brand-card overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text">
                Editar producto
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted underline">
                Cerrar
              </button>
            </div>

            <ActionForm
              action={async (fd) => {
                const result = await updateMembershipPlan(fd);
                if (result.ok) setOpen(false);
                return result;
              }}
              successMessage="Producto actualizado."
              resetOnSuccess={false}
              className="space-y-3"
            >
              <input type="hidden" name="planId" value={plan.id} />
              <Field label="Nombre">
                <Input name="name" required defaultValue={plan.name} />
              </Field>
              <Field label="Tipo">
                <Select name="type" defaultValue={plan.type}>
                  {(Object.keys(PLAN_TYPE_LABEL) as PlanType[]).map((t) => (
                    <option key={t} value={t}>
                      {PLAN_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Precio (€)">
                <Input name="priceEuros" required inputMode="decimal" defaultValue={(plan.priceCents / 100).toFixed(2)} />
              </Field>
              <Field label="Sesiones incluidas">
                <Input
                  name="sessionsIncluded"
                  inputMode="numeric"
                  defaultValue={plan.sessionsIncluded ?? ""}
                  placeholder="Solo bonos"
                />
              </Field>
              <Field label="Validez (días)">
                <Input
                  name="validityDays"
                  inputMode="numeric"
                  defaultValue={plan.validityDays ?? ""}
                  placeholder="Opcional"
                />
              </Field>

              <p className="text-xs text-muted bg-tz-sand border border-brand-border rounded-control p-3">
                Si cambias el precio, las suscripciones ya en marcha conservan el importe que
                contrataron. El nuevo precio se aplica a las siguientes ventas.
              </p>

              <Button type="submit">Guardar cambios</Button>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

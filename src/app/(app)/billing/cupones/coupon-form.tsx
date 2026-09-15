"use client";

import { useState, useTransition } from "react";
import { createCouponAction } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
// De `coupon-code.ts`, no de `stripe-coupons.ts`: este es un componente de
// cliente y el segundo arrastra Prisma al bundle del navegador. La regla de
// normalización es la misma, y es lo único que hace falta aquí.
import { normalizeCouponCode } from "@/lib/coupon-code";

/**
 * HU-ST-27 · Alta del código. La normalización del código se hace también aquí
 * —con la MISMA función que usa el servidor— para que quien escribe "verano 25"
 * vea al momento el "VERANO-25" que va a quedar creado, en vez de descubrirlo
 * después en el listado.
 */
export default function CouponForm({ disabled, disabledReason }: { disabled: boolean; disabledReason?: string }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          const result = await createCouponAction(fd);
          if (result.ok) {
            setCode("");
            toast.success("Código creado en tu cuenta de Stripe.");
          } else {
            toast.error(result.error);
          }
        });
      }}
      className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
    >
      <Field label="Código" className="md:col-span-2" hint={code ? `Quedará como ${normalizeCouponCode(code)}` : undefined}>
        <Input
          name="code"
          required
          disabled={disabled}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="VERANO25"
        />
      </Field>
      <Field label="Descripción (opcional)" className="md:col-span-2">
        <Input name="name" disabled={disabled} placeholder="Campaña de verano" />
      </Field>
      <Field label="Tipo">
        <Select name="kind" disabled={disabled} value={kind} onChange={(e) => setKind(e.target.value as "percent" | "amount")}>
          <option value="percent">Porcentaje</option>
          <option value="amount">Importe fijo</option>
        </Select>
      </Field>
      <Field label={kind === "percent" ? "Descuento (%)" : "Descuento (€)"}>
        <Input
          name="value"
          type="number"
          step={kind === "percent" ? "1" : "0.01"}
          min={kind === "percent" ? "1" : "0.01"}
          max={kind === "percent" ? "100" : undefined}
          required
          disabled={disabled}
        />
      </Field>
      <Field label="Caduca (opcional)" className="md:col-span-2">
        <Input name="redeemBy" type="date" disabled={disabled} />
      </Field>
      <div className="md:col-span-4 flex items-center gap-3">
        <Button type="submit" disabled={disabled || pending || !code.trim()}>
          {pending && <ButtonSpinner />}
          {pending ? "Creando..." : "Crear código"}
        </Button>
        {disabled && disabledReason && <span className="text-xs text-brand-muted">{disabledReason}</span>}
      </div>
    </form>
  );
}

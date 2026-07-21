"use client";

import { useRef, useTransition } from "react";
import { createReferenceRange } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function CreateRangeForm() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        startTransition(async () => {
          const result = await createReferenceRange(fd);
          if (result.ok) {
            toast.success("Rango añadido.");
            formRef.current?.reset();
          } else {
            toast.error(result.error);
          }
        });
      }}
      className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card grid grid-cols-2 md:grid-cols-7 gap-3 items-end"
    >
      <Field label="Métrica" className="col-span-2">
        <Select name="metric">
          <option value="bodyFatPct">% graso</option>
          <option value="bmi">IMC</option>
          <option value="visceralFatRating">Grasa visceral</option>
          <option value="bodyWaterPct">Agua corporal</option>
        </Select>
      </Field>
      <Field label="Sexo">
        <Select name="sex" defaultValue="">
          <option value="">Ambos</option>
          <option value="M">Hombre</option>
          <option value="F">Mujer</option>
        </Select>
      </Field>
      <Field label="Edad mín.">
        <Input name="ageMin" type="number" placeholder="opcional" />
      </Field>
      <Field label="Edad máx.">
        <Input name="ageMax" type="number" placeholder="opcional" />
      </Field>
      <Field label="Mínimo">
        <Input name="min" type="number" step="0.1" placeholder="opcional" />
      </Field>
      <Field label="Máximo">
        <Input name="max" type="number" step="0.1" placeholder="opcional" />
      </Field>
      <Button type="submit" disabled={pending} className="col-span-2 md:col-span-1">
        {pending && <ButtonSpinner />}
        Añadir rango
      </Button>
    </form>
  );
}

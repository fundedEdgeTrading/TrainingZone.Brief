"use client";

import { useRef, useTransition } from "react";
import { createAptitudeRule } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function CreateRuleForm() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        startTransition(async () => {
          const result = await createAptitudeRule(fd);
          if (result.ok) {
            toast.success("Regla añadida.");
            formRef.current?.reset();
          } else {
            toast.error(result.error);
          }
        });
      }}
      className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
    >
      <Field label="Zona">
        <Input name="injuryZone" placeholder="p.ej. hombro derecho" required />
      </Field>
      <Field label="Bloque">
        <Input name="blockArea" placeholder="p.ej. Empuje vertical" required />
      </Field>
      <Field label="Semáforo">
        <Select name="light">
          <option value="RED">Evitar</option>
          <option value="AMBER">Adaptar</option>
          <option value="GREEN">Libre</option>
        </Select>
      </Field>
      <Field label="Adaptación">
        <Input name="adaptation" placeholder="opcional" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending && <ButtonSpinner />}
        Añadir regla
      </Button>
    </form>
  );
}

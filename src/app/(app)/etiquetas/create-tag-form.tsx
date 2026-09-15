"use client";

import { useRef, useTransition } from "react";

import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TAG_LABEL_MAX } from "@/lib/tags";
import { createTagAction } from "./actions";

const COLORS: { value: string; label: string }[] = [
  { value: "neutral", label: "Gris" },
  { value: "good", label: "Verde" },
  { value: "warning", label: "Ámbar" },
  { value: "critical", label: "Rojo" },
  { value: "trial", label: "Azul" },
  { value: "gold", label: "Oro" },
];

export default function CreateTagForm() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        startTransition(async () => {
          const result = await createTagAction(fd);
          if (result.ok) {
            toast.success("Etiqueta creada.");
            formRef.current?.reset();
          } else {
            toast.error(result.error);
          }
        });
      }}
      className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 items-end"
    >
      <Field label="Nueva etiqueta manual" hint="La ponéis y la quitáis vosotros desde la ficha del socio.">
        <Input name="label" placeholder="p.ej. Reto de verano" maxLength={TAG_LABEL_MAX} required />
      </Field>
      <Field label="Color">
        <Select name="color" defaultValue="neutral">
          {COLORS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending && <ButtonSpinner />}
        Crear etiqueta
      </Button>
    </form>
  );
}

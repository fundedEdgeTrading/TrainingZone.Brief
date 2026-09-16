"use client";

import { useState, useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { setFlowsTestEmailAction } from "./actions";

/**
 * REGLA 5 · El buzón de pruebas.
 *
 * Es la única forma de probar un flujo sin escribir a 49 socios: un flujo en
 * borrador se ejecuta DE VERDAD —entra gente, avanzan los pasos, se anota todo—
 * pero cada correo va aquí en vez de al socio. Sin esta dirección, un borrador
 * no manda nada, y eso se dice en el propio campo.
 */
export function TestEmailForm({ value }: { value: string | null }) {
  const [email, setEmail] = useState(value ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card grid grid-cols-1 md:grid-cols-[2fr_auto] gap-3 items-end"
      action={() =>
        startTransition(async () => {
          const result = await setFlowsTestEmailAction(email);
          if (result.ok) toast.success(email ? "Buzón de pruebas guardado." : "Buzón de pruebas vacío: los borradores no mandarán nada.");
          else toast.error(result.error);
        })
      }
    >
      <Field
        label="Email de pruebas"
        hint="Todo lo que mande un flujo en BORRADOR va aquí, nunca al socio. Sin esta dirección, un borrador no manda nada."
      >
        <Input
          name="flowsTestEmail"
          type="email"
          value={email}
          placeholder="pruebas@tucentro.es"
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending && <ButtonSpinner />}
        Guardar
      </Button>
    </form>
  );
}

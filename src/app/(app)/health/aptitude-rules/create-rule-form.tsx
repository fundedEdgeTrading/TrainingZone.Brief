"use client";

import { useRef, useState, useTransition } from "react";
import type { InjuryZone } from "@prisma/client";
import { createAptitudeRule } from "./actions";
import { INJURY_ZONES, INJURY_ZONE_LABEL, LATERALITY_LABEL, defaultSideFor } from "@/lib/injury-zones";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function CreateRuleForm() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [zoneCode, setZoneCode] = useState<InjuryZone>("HOMBRO");
  const asksSide = defaultSideFor(zoneCode) === null;

  return (
    <form
      ref={formRef}
      action={(fd) => {
        startTransition(async () => {
          const result = await createAptitudeRule(fd);
          if (result.ok) {
            toast.success("Regla añadida.");
            formRef.current?.reset();
            setZoneCode("HOMBRO");
          } else {
            toast.error(result.error);
          }
        });
      }}
      className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
    >
      <Field label="Zona">
        <Select name="zoneCode" value={zoneCode} onChange={(e) => setZoneCode(e.target.value as InjuryZone)}>
          {INJURY_ZONES.map((z) => (
            <option key={z} value={z}>
              {INJURY_ZONE_LABEL[z]}
            </option>
          ))}
        </Select>
      </Field>
      {asksSide && (
        <Field label="Lado" hint="Vacío = los dos lados">
          <Select name="side" defaultValue="">
            <option value="">Cualquiera</option>
            <option value="IZQUIERDA">{LATERALITY_LABEL.IZQUIERDA}</option>
            <option value="DERECHA">{LATERALITY_LABEL.DERECHA}</option>
          </Select>
        </Field>
      )}
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

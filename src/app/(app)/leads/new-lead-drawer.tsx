"use client";

import { useRef, useState, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createLeadAction } from "./actions";

export function NewLeadDrawer({
  centers,
  channels,
}: {
  centers: { id: string; name: string }[];
  channels: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo lead</Button>
      <Drawer open={open} onClose={() => setOpen(false)} kicker="Contacto presencial" title="Nuevo lead">
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await createLeadAction(fd);
              if (result.ok) {
                setOpen(false);
                formRef.current?.reset();
                toast.success("Lead creado");
              } else {
                toast.error(result.error);
              }
            })
          }
          className="flex flex-col gap-5 p-6 sm:p-7"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Nombre">
              <Input name="firstName" required placeholder="Nombre" />
            </Field>
            <Field label="Apellidos">
              <Input name="lastName" required placeholder="Apellidos" />
            </Field>
            <Field label="Teléfono">
              <Input name="phone" required placeholder="600 000 000" />
            </Field>
            <Field label="Email (opcional)">
              <Input name="email" type="email" placeholder="lead@email.es" />
            </Field>
            <Field label="Código postal">
              <Input name="postalCode" required pattern="\d{5}" maxLength={5} placeholder="28001" />
            </Field>
            <Field label="Centro">
              <Select name="centerId" required defaultValue="">
                <option value="" disabled>
                  Seleccionar...
                </option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ocupación">
              <Input name="occupation" required placeholder="A qué se dedica" />
            </Field>
            <Field label="¿Tiene hijos? (opcional)">
              <Select name="hasChildren" defaultValue="">
                <option value="">Sin especificar</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Sexo (opcional)">
              <Select name="sex" defaultValue="">
                <option value="">Sin especificar</option>
                <option value="FEMALE">Mujer</option>
                <option value="MALE">Hombre</option>
                <option value="OTHER">Otro</option>
              </Select>
            </Field>
            <Field label="Canal de origen">
              <Select name="channel" required defaultValue="">
                <option value="" disabled>
                  Seleccionar...
                </option>
                {channels.map((c) => (
                  <option key={c.id} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="¿Ha entrenado antes?">
              <Select name="hasTrainedBefore" defaultValue="no">
                <option value="no">No</option>
                <option value="yes">Sí</option>
              </Select>
            </Field>
          </div>
          <Field label="Objetivos">
            <textarea name="goals" required rows={2} className="w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm" />
          </Field>
          <Field label="Lesiones / patologías" hint='Obligatorio, escribe "ninguna" si no aplica'>
            <Input name="healthNote" required placeholder="Ninguna / detalle" />
          </Field>
        </form>
        <DrawerFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending && <ButtonSpinner />}
            {pending ? "Guardando..." : "Guardar lead"}
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

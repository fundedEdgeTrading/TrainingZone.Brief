"use client";

import { useRef, useState, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { ImageDropzone } from "@/components/ui/dropzone";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createMember } from "./actions";

export function NewMemberDrawer({
  centers,
  plans,
}: {
  centers: { id: string; name: string }[];
  plans: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo socio</Button>
      <Drawer open={open} onClose={() => setOpen(false)} kicker="Alta de socio" title="Nuevo socio">
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await createMember(fd);
              if (result.ok) {
                setOpen(false);
                formRef.current?.reset();
                toast.success({ title: "Socio creado", description: `Email de bienvenida enviado a ${fd.get("email")}.` });
              } else {
                toast.error(result.error);
              }
            })
          }
          className="flex flex-col gap-5 p-6 sm:p-7"
        >
          <div className="flex gap-5 items-center">
            <ImageDropzone name="photoUrl" shape="circle" sizeClassName="w-24 h-24" />
            <div className="text-[13px] text-muted">
              <div className="font-bold text-tz-black text-sm">Foto de perfil</div>
              Arrastra una imagen o haz clic en el círculo. El socio podrá cambiarla desde su portal.
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Nombre">
              <Input name="firstName" required placeholder="Nombre" />
            </Field>
            <Field label="Apellidos">
              <Input name="lastName" required placeholder="Apellidos" />
            </Field>
            <Field label="Email" className="sm:col-span-2" hint="Al guardar se enviará la bienvenida con el enlace de acceso para crear su contraseña y firmar los consentimientos.">
              <Input name="email" type="email" required placeholder="socio@email.es" />
            </Field>
            <Field label="Teléfono">
              <Input name="phone" placeholder="+34 600 000 000" />
            </Field>
            <Field label="Fecha de nacimiento">
              <Input name="birthDate" type="date" />
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
            <Field label="Plan">
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
          <div className="bg-tz-bone border border-brand-border rounded-xl px-4 py-3.5 text-[13px] text-text-2 flex gap-2.5 items-start">
            <span className="w-2 h-2 rounded-full bg-apta-gold shrink-0 mt-[5px]" />
            Los consentimientos (salud Art. 9 RGPD, contrato, imágenes y marketing) los firmará el propio socio en
            su primer acceso — no se recogen aquí.
          </div>
        </form>
        <DrawerFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending && <ButtonSpinner />}
            {pending ? "Guardando..." : "Guardar y enviar bienvenida"}
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

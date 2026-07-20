"use client";

import { useRef, useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/rbac";
import { createStaffUser } from "./actions";

export function StaffDrawer({
  centers,
  createRoles,
}: {
  centers: { id: string; name: string }[];
  createRoles: Role[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nueva persona</Button>
      <Drawer open={open} onClose={() => setOpen(false)} kicker="Alta de personal" title="Nueva persona" widthClassName="sm:w-[500px]">
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await createStaffUser(fd);
              if (result.ok) {
                setOpen(false);
                formRef.current?.reset();
                toast.success({ title: "Persona creada", description: `Invitación enviada a ${fd.get("email")}.` });
              } else {
                toast.error(result.error);
              }
            })
          }
          className="flex flex-col gap-5 p-6 sm:p-7"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Nombre" className="sm:col-span-2">
              <Input name="name" required placeholder="Nombre y apellidos" />
            </Field>
            <Field label="Email" className="sm:col-span-2" hint="Recibirá un email de invitación con su enlace para crear la contraseña.">
              <Input name="email" type="email" required placeholder="persona@empresa.es" />
            </Field>
            <Field label="Rol">
              <Select name="role" defaultValue="TRAINER">
                {createRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Centro base" hint="Solo roles de centro">
              <Select name="primaryCenterId" defaultValue={centers[0]?.id ?? ""}>
                <option value="">— (organización) —</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="bg-tz-bone border border-brand-border rounded-xl px-4 py-3.5 text-[13px] text-text-2 flex gap-2.5 items-start">
            <span className="w-2 h-2 rounded-full bg-apta-gold shrink-0 mt-[5px]" />
            El rol define sus permisos: p.ej. Recepción no ve datos de salud; Dirección de centro solo su centro.
            Todo acceso queda auditado.
          </div>
        </form>
        <DrawerFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending && <ButtonSpinner />}
            {pending ? "Guardando..." : "Guardar y enviar invitación"}
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

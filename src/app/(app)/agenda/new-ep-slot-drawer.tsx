"use client";

import { useRef, useState, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createEpSlotAction } from "./ep-slot-actions";

export function NewEpSlotDrawer({
  centerId,
  trainers,
  members,
  showTrainerSelect,
}: {
  centerId: string;
  trainers: { id: string; name: string }[];
  members: { id: string; firstName: string; lastName: string }[];
  showTrainerSelect: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Franja EP
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} kicker="Personal Training" title="Nueva franja de EP">
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await createEpSlotAction(fd);
              if (result.ok) {
                setOpen(false);
                formRef.current?.reset();
                toast.success("Franja de EP creada");
              } else {
                toast.error(result.error);
              }
            })
          }
          className="flex flex-col gap-4 p-6 sm:p-7"
        >
          <input type="hidden" name="centerId" value={centerId} />
          {showTrainerSelect && (
            <Field label="Entrenador">
              <Select name="trainerId" defaultValue="">
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <Input name="date" type="date" required />
            </Field>
            <Field label="Hora de inicio">
              <Input name="startTime" type="time" required />
            </Field>
          </div>
          <Field label="Duración (minutos)">
            <Input name="durationMin" type="number" defaultValue={60} min={15} step={15} />
          </Field>
          <Field label="Reservar directamente a un cliente (opcional)" hint="Déjalo vacío y marca autorreservable para que lo coja el propio cliente">
            <Select name="memberId" defaultValue="">
              <option value="">— Dejar sin reservar —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" name="selfBookable" />
            Autorreservable por el cliente de EP
          </label>
        </form>
        <DrawerFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending && <ButtonSpinner />}
            {pending ? "Creando..." : "Crear franja"}
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

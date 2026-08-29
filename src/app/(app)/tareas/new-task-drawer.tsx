"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MAX_TITLE_LENGTH, TASK_PRIORITIES, TASK_PRIORITY_LABEL } from "@/lib/tasks";
import { createTaskAction } from "./actions";

/**
 * Alta manual de una tarea. El texto es libre a propósito: el encargo lo
 * describe quien lo manda, y no se enlaza con la pantalla de la acción que
 * describe (alta de socio, baja...). Una tarea es un recado entre personas, no
 * un flujo guiado.
 */
export function NewTaskDrawer({
  assignees,
  categories,
  defaultRecipientId,
  canAssign,
}: {
  assignees: { id: string; name: string }[];
  /** Categorías ya en uso: se ofrecen como sugerencia, sin cerrar la lista. */
  categories: string[];
  defaultRecipientId: string;
  /** Sin permiso para repartir, la tarea solo puede ser para uno mismo. */
  canAssign: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const toast = useToast();

  const me = assignees.find((a) => a.id === defaultRecipientId);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nueva tarea</Button>
      <Drawer open={open} onClose={() => setOpen(false)} kicker="Tarea manual" title="Nueva tarea">
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              const result = await createTaskAction(formData);
              if (result.ok) {
                toast.success("Tarea creada");
                formRef.current?.reset();
                setOpen(false);
                router.refresh();
              } else toast.error(result.error);
            })
          }
          className="p-6 sm:p-7 space-y-4"
        >
          <Field label="Tarea" hint={`Qué hay que hacer. Máximo ${MAX_TITLE_LENGTH} caracteres.`}>
            <Input name="title" required maxLength={MAX_TITLE_LENGTH} placeholder="Llamar a los socios de la lista de espera" />
          </Field>

          <Field label="Detalle" hint="Opcional: contexto, teléfonos, lo que haga falta.">
            <Textarea name="body" rows={3} placeholder="…" />
          </Field>

          <Field label="Asignar a" hint={canAssign ? undefined : "Solo puedes crearte tareas a ti."}>
            {canAssign ? (
              <Select name="recipientUserId" defaultValue={defaultRecipientId} required searchable>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : (
              <>
                <input type="hidden" name="recipientUserId" value={defaultRecipientId} />
                <Input value={me?.name ?? "Yo"} readOnly disabled />
              </>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridad">
              <Select name="priority" defaultValue="MEDIA">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha límite" hint="Opcional.">
              <Input type="date" name="dueDate" />
            </Field>
          </div>

          <Field label="Categoría" hint="Opcional: el cajón al que pertenece.">
            <Input name="category" list="tz-task-categories" placeholder="Comercial, instalaciones…" />
            <datalist id="tz-task-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <DrawerFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <ButtonSpinner />}
              Crear tarea
            </Button>
          </DrawerFooter>
        </form>
      </Drawer>
    </>
  );
}

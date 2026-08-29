"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { reassignTaskAction } from "./actions";

/**
 * Reasignar sin salir de la tarjeta (RB-TASK-002). Es un `<select>` nativo y no
 * el `Select` de la app a propósito: vive dentro de una tarjeta arrastrable, y
 * el desplegable en portal del componente compartido se pelea con el gesto de
 * arrastre. Quien la encargó no cambia: solo cambia quién la hace.
 */
export function TaskAssignee({
  taskId,
  taskTitle,
  assignees,
  currentUserId,
  currentName,
}: {
  taskId: string;
  /** Identifica el control: en un tablero hay uno por tarjeta. */
  taskTitle: string;
  assignees: { id: string; name: string }[];
  currentUserId: string;
  currentName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // Quien tiene la tarea puede no estar en la lista de asignables (baja de
  // plantilla, RB-RRHH-014): entonces el `select` arranca en una opción muerta
  // con su nombre en vez de enseñar a otra persona como responsable.
  const known = assignees.some((a) => a.id === currentUserId);

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-brand-muted max-w-[280px]">
      <span className="font-bold uppercase tracking-[.06em] shrink-0">Asignar a</span>
      <select
        aria-label={`Reasignar «${taskTitle}»`}
        disabled={pending}
        value={known ? currentUserId : ""}
        onChange={(e) => {
          const recipientUserId = e.target.value;
          if (!recipientUserId) return;
          startTransition(async () => {
            const result = await reassignTaskAction(taskId, recipientUserId);
            if (result.ok) {
              toast.success("Tarea reasignada");
              router.refresh();
            } else toast.error(result.error);
          });
        }}
        className="min-w-0 flex-1 rounded-lg border border-brand-border bg-white px-1.5 py-1 text-[11px] text-brand-text disabled:opacity-50"
      >
        {/* Un destinatario dado de baja ya no está en la lista: sin esta opción
            el `select` enseñaría a otra persona como responsable actual. */}
        {!known && (
          <option value="" disabled>
            {currentName}
          </option>
        )}
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

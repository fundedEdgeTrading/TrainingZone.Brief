"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ActionForm } from "@/components/ui/action-form";
import { useToast } from "@/components/ui/toast";
import { clockInAction, clockOutAction, signEntryAction, updateCheckinConfigAction } from "./actions";

type Entry = { id: string; workDate: Date; clockIn: string; clockOut: string | null; signedAt: Date | null };

// Fichaje aparcado (F2, docs/MODULOS_APARCADOS.md): este widget ya no se
// monta en /rrhh. Se conserva —igual que `TimeClockEntry` y sus queries— para
// poder devolverlo al panel sin reescribirlo.
export function TimeClockWidget({ todayEntry, recent }: { todayEntry: Entry | null; recent: Entry[] }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success("Registrado");
      else toast.error(result.error ?? "Error");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !!todayEntry} onClick={() => run(clockInAction)}>
          Fichar entrada
        </Button>
        <Button size="sm" variant="secondary" disabled={pending || !todayEntry || !!todayEntry?.clockOut} onClick={() => run(clockOutAction)}>
          Fichar salida
        </Button>
        {todayEntry?.clockOut && !todayEntry.signedAt && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => signEntryAction(todayEntry.id))}>
            Firmar jornada
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-faint text-left">
            <tr>
              <th className="pb-2">Fecha</th>
              <th className="pb-2">Entrada</th>
              <th className="pb-2">Salida</th>
              <th className="pb-2">Firma</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((e) => (
              <tr key={e.id} className="border-t border-tz-sand">
                <td className="py-2">{e.workDate.toLocaleDateString("es-ES")}</td>
                <td className="py-2 tz-nums">{e.clockIn}</td>
                <td className="py-2 tz-nums">{e.clockOut ?? "—"}</td>
                <td className="py-2">{e.signedAt ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { GROUP: "Grupos", PERSONAL_TRAINING: "Personal Training", ONLINE: "Online" };

export function CheckinConfigForm({
  config,
}: {
  config: { serviceKind: string; goalCheckinDays: number; trainerRatingDays: number };
}) {
  return (
    <ActionForm action={updateCheckinConfigAction} successMessage="Intervalo actualizado" resetOnSuccess={false} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
      <input type="hidden" name="serviceKind" value={config.serviceKind} />
      <Field label={KIND_LABEL[config.serviceKind]}>
        <span className="text-xs text-brand-muted">Objetivos / Valoración (días)</span>
      </Field>
      <Field label="Check-in objetivos">
        <Input name="goalCheckinDays" type="number" min={1} defaultValue={config.goalCheckinDays} />
      </Field>
      <div className="flex gap-2">
        <Input name="trainerRatingDays" type="number" min={1} defaultValue={config.trainerRatingDays} />
        <Button type="submit" size="sm">
          Guardar
        </Button>
      </div>
    </ActionForm>
  );
}

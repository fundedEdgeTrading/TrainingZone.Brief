"use client";

import { useRef, useState, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { importMembersCsv, type ImportSummary } from "./import-actions";

export function ImportMembersDrawer({ centers }: { centers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  function close() {
    setOpen(false);
    setSummary(null);
    formRef.current?.reset();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Importar CSV
      </Button>
      <Drawer open={open} onClose={close} kicker="Importación de socios" title="Importar socios desde CSV">
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              const result = await importMembersCsv(fd);
              if (result.ok) {
                setSummary(result.summary);
                toast.success({
                  title: "Importación completada",
                  description: `${result.summary.created} altas · ${result.summary.updated} actualizados · ${result.summary.skipped} omitidos.`,
                });
              } else {
                toast.error(result.error);
              }
            })
          }
          className="flex flex-col gap-5 p-6 sm:p-7"
        >
          <div className="bg-tz-bone border border-brand-border rounded-xl px-4 py-3.5 text-[13px] text-text-2 flex gap-2.5 items-start">
            <span className="w-2 h-2 rounded-full bg-apta-gold shrink-0 mt-[5px]" />
            <span>
              Sube el CSV exportado de tu plataforma anterior (p.ej. MyWellness/Technogym). Se reconocen las
              columnas <strong>Nombre, Apellidos, Email, Móvil, Fecha de nacimiento, Sexo, Dirección, C.P.,
              Fecha de inscripción, Tipo de contacto, Riesgo de abandono</strong> y el{" "}
              <strong>Identificador de la nube</strong>. Reimportar el mismo archivo{" "}
              <strong>actualiza</strong> los socios, no los duplica. No se envían emails de bienvenida.
            </span>
          </div>

          <Field label="Centro de destino" hint="Los socios nuevos se darán de alta en este centro.">
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

          <Field label="Archivo CSV">
            <input
              name="file"
              type="file"
              accept=".csv,text/csv,text/plain"
              required
              className="block w-full text-sm text-text-2 file:mr-3 file:rounded-lg file:border-0 file:bg-tz-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90 file:cursor-pointer cursor-pointer rounded-xl border border-brand-border bg-white px-3 py-2"
            />
          </Field>

          {summary && (
            <div className="rounded-xl border border-brand-border overflow-hidden text-sm">
              <div className="grid grid-cols-3 divide-x divide-brand-border bg-tz-bone">
                <ResultStat label="Altas" value={summary.created} />
                <ResultStat label="Actualizados" value={summary.updated} />
                <ResultStat label="Omitidos" value={summary.skipped} />
              </div>
              {summary.errors.length > 0 && (
                <div className="px-4 py-3 border-t border-brand-border max-h-48 overflow-auto">
                  <div className="font-semibold text-brand-text mb-1.5 text-[13px]">
                    Filas omitidas ({summary.errors.length})
                  </div>
                  <ul className="space-y-1 text-[12px] text-brand-muted">
                    {summary.errors.slice(0, 30).map((e) => (
                      <li key={e.row}>
                        <span className="tz-nums font-medium text-brand-text-2">Fila {e.row}:</span>{" "}
                        {e.messages.join(" ")}
                      </li>
                    ))}
                    {summary.errors.length > 30 && <li>…y {summary.errors.length - 30} más.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </form>
        <DrawerFooter>
          <Button type="button" variant="secondary" onClick={close}>
            {summary ? "Cerrar" : "Cancelar"}
          </Button>
          <Button type="submit" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending && <ButtonSpinner />}
            {pending ? "Importando..." : "Importar socios"}
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-xl font-display font-bold text-brand-text tz-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-brand-muted">{label}</div>
    </div>
  );
}

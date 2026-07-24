"use client";

import { useRef, useState, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createLeadAction } from "./actions";

type Mode = "seguimiento" | "directo" | "online";

const KICKER: Record<Mode, string> = {
  seguimiento: "Contacto comercial",
  directo: "Alta presencial",
  online: "Autoservicio web",
};

const SUBMIT_LABEL: Record<Mode, string> = {
  seguimiento: "Guardar lead",
  directo: "Cerrar alta presencial",
  online: "Cerrado online",
};

export function NewLeadDrawer({
  centers,
  channels,
  plans,
  trainers,
}: {
  centers: { id: string; name: string }[];
  channels: { id: string; label: string }[];
  plans: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("seguimiento");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo lead</Button>
      <Drawer open={open} onClose={() => setOpen(false)} kicker={KICKER[mode]} title="Nuevo lead">
        <div className="px-6 sm:px-7 pt-5">
          <div className="flex bg-brand-bg border border-tz-sand rounded-xl p-1 gap-1">
            {(["seguimiento", "directo", "online"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                  mode === m ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-tz-sand/60"
                }`}
              >
                {m === "seguimiento" ? "Lead / seguimiento" : m === "directo" ? "Cerrado directamente" : "Cerrado online"}
              </button>
            ))}
          </div>
        </div>

        {mode === "online" ? (
          <div className="p-6 sm:p-7 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gold-bg flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l3 3" />
              </svg>
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-brand-text">Cierre online automático</h3>
              <p className="text-sm text-brand-muted mt-1.5">
                Este flujo lo genera la plataforma automáticamente cuando un cliente compra una suscripción directamente por la web, sin
                contacto previo ni formulario del centro. El lead se crea ya cerrado y queda sin responsable (autoservicio).
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-warning-bg text-warning-text px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em]">
              Flujo pendiente de implementación
            </span>
          </div>
        ) : (
          <form
            ref={formRef}
            action={(fd) =>
              startTransition(async () => {
                fd.set("mode", mode);
                const result = await createLeadAction(fd);
                if (result.ok) {
                  setOpen(false);
                  formRef.current?.reset();
                  toast.success(mode === "directo" ? "Alta presencial cerrada" : "Lead creado");
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
              <Field label={mode === "directo" ? "Email" : "Email (opcional)"}>
                <Input name="email" type="email" required={mode === "directo"} placeholder="lead@email.es" />
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

            {mode === "directo" && (
              <div className="rounded-xl bg-trial-bg border border-trial/20 p-4 space-y-3">
                <p className="text-sm font-semibold text-trial">Alta presencial · plan contratado</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plan inicial">
                    <Select name="planId" defaultValue="">
                      <option value="">— Sin plan —</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Entrenador">
                    <Select name="trainerId" defaultValue="">
                      <option value="">— Sin asignar —</option>
                      {trainers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            )}
          </form>
        )}

        <DrawerFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={pending || mode === "online"}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {pending && <ButtonSpinner />}
            {pending ? "Guardando..." : SUBMIT_LABEL[mode]}
          </Button>
        </DrawerFooter>
      </Drawer>
    </>
  );
}

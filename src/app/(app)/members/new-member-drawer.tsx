"use client";

import { useRef, useState, useTransition } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { ImageDropzone } from "@/components/ui/dropzone";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ADULT_AGE, ageOn, agePolicyLabel, type AgePolicy } from "@/lib/minors";
import { createMember } from "./actions";

// Fila del bloque "Bonos": solo necesitamos una key estable para React, el
// plan/centro elegidos viven en el DOM (selects no controlados) y se leen del
// FormData al enviar — mismo estilo no controlado que el resto del drawer.
type BonoRow = { key: string };

export function NewMemberDrawer({
  centers,
  plans,
  agePolicy,
}: {
  centers: { id: string; name: string }[];
  plans: { id: string; name: string }[];
  /** E10-12: política de edad declarada por la organización (D-P8). */
  agePolicy: AgePolicy;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [bonoRows, setBonoRows] = useState<BonoRow[]>([]);
  // E10-12: el bloque de tutor aparece en cuanto la fecha indica que es menor.
  // Es una ayuda de la interfaz, no el control: el que manda está en el
  // servidor, que no se fía de un formulario que viaja por la red.
  const [birthDate, setBirthDate] = useState("");
  const age = birthDate ? ageOn(new Date(`${birthDate}T00:00:00.000Z`), new Date()) : null;
  const isMinor = age != null && Number.isFinite(age) && age >= 0 && age < ADULT_AGE;
  const bonoCounter = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  function addBonoRow() {
    bonoCounter.current += 1;
    setBonoRows((rows) => [...rows, { key: `bono-${bonoCounter.current}` }]);
  }

  function removeBonoRow(key: string) {
    setBonoRows((rows) => rows.filter((r) => r.key !== key));
  }

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
                setBonoRows([]);
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
            <Field label="Fecha de nacimiento" hint={agePolicyLabel(agePolicy)}>
              <Input
                name="birthDate"
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
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
          </div>

          {isMinor && !agePolicy.allowsMinors && (
            <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">
              Este centro solo admite socios mayores de {ADULT_AGE} años. Cambia la política en Organización → Menores
              si quieres admitir menores.
            </p>
          )}

          {isMinor && agePolicy.allowsMinors && (
            <div className="border border-tz-sand rounded-[14px] bg-tz-bone/40 p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Tutor legal</div>
              <p className="text-xs text-muted mt-0.5 mb-3">
                Socio menor de edad: el art. 7.2 LOPDGDD exige poder acreditar que el consentimiento lo prestó quien
                tiene la patria potestad. Sin las cuatro casillas, el alta no se completa.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Nombre del tutor">
                  <Input name="guardianName" placeholder="Nombre y apellidos" />
                </Field>
                <Field label="Documento de identidad del tutor">
                  <Input name="guardianIdDocument" placeholder="DNI / NIE" />
                </Field>
                <Field label="Email del tutor">
                  <Input name="guardianEmail" type="email" placeholder="tutor@email.es" />
                </Field>
                <Field label="Teléfono del tutor">
                  <Input name="guardianPhone" placeholder="+34 600 000 000" />
                </Field>
                <Field
                  label="Justificante del consentimiento"
                  className="sm:col-span-2"
                  hint="Referencia verificable: nº de documento firmado, expediente o enlace al archivo."
                >
                  <Input name="guardianEvidence" placeholder="p.ej. Consentimiento firmado 2026-09-06, exp. 118" />
                </Field>
              </div>
            </div>
          )}

          <div className="border border-tz-sand rounded-[14px] bg-tz-bone/40 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Bonos</div>
                <p className="text-xs text-muted mt-0.5">Opcional: puede darse de alta sin bono y añadírselo después.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addBonoRow}>
                + Añadir bono
              </Button>
            </div>
            {bonoRows.length > 0 && (
              <div className="flex flex-col gap-3">
                {bonoRows.map((row) => (
                  <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
                    <Field label="Plan">
                      <Select name="bonoPlanId" required defaultValue="">
                        <option value="" disabled>
                          Seleccionar...
                        </option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Centro del bono">
                      <Select name="bonoCenterId" required defaultValue="">
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
                    <Button type="button" variant="secondary" size="sm" onClick={() => removeBonoRow(row.key)}>
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
            )}
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

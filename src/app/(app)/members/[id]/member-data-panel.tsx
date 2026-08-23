"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { postalAreaLabel } from "@/lib/postal-codes";
import { deleteMember, updateMemberData } from "./actions";
import { useFocusRequest } from "./section-rail";

export type MemberDataPanelValues = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  /** "yyyy-mm-dd" ya normalizada en el servidor. */
  birthDate: string | null;
  sex: string | null;
  occupation: string | null;
  emergencyContact: string | null;
  primaryCenterId: string;
  primaryCenterName: string;
  primaryCenterAddress: string | null;
  /** ISO; se formatean con el helper local para no depender del ICU del navegador. */
  joinedAt: string;
  state: string;
  consentContractAt: string | null;
  consentHealthAt: string | null;
  consentImagesAt: string | null;
  consentMarketingAt: string | null;
  consentAIAt: string | null;
};

const LABEL = "block text-[10px] font-bold uppercase tracking-[0.1em] text-brand-muted";
const KICKER = "font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted";
const BAR = "w-1.5 h-[18px] rounded-[2px] shrink-0";

// Formateo propio (sin toLocaleDateString) para que servidor y cliente pinten
// exactamente lo mismo: el ICU de Node y el del navegador no coinciden en las
// abreviaturas de mes en es-ES ("sept." vs "sep.") y eso rompe la hidratación.
function fmtDay(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Edad cumplida a partir de la fecha de nacimiento "yyyy-mm-dd". */
function age(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const now = new Date();
  let years = now.getFullYear() - y;
  const month = now.getMonth() + 1;
  if (month < m || (month === m && now.getDate() < d)) years -= 1;
  return years >= 0 ? years : null;
}

/** Campo de la rejilla de datos: etiqueta pequeña + valor, "—" cuando falta. */
function DataField({
  label,
  value,
  hint,
  nums,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  nums?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className={LABEL}>{label}</div>
      <div
        className={`text-sm font-medium text-brand-text mt-[5px] [overflow-wrap:anywhere] ${nums ? "tz-nums" : ""}`}
      >
        {value ?? "—"}
      </div>
      {hint && <div className="text-[11px] text-brand-faint">{hint}</div>}
    </div>
  );
}

function AreaChip({ postalCode }: { postalCode: string | null }) {
  const area = postalAreaLabel(postalCode);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-gold-bg text-gold px-[11px] py-1 text-xs font-bold">
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {area ?? "Sin código postal"}
    </span>
  );
}

/**
 * Rejilla de datos del socio (sección "Socio") + drawer de edición. Las tarjetas
 * de resumen que vivían aquí (antigüedad, centro, estado, asistencia) están
 * ahora en la franja de métricas de la cabecera de la ficha.
 */
export function MemberDataPanel({
  member,
  centers,
}: {
  member: MemberDataPanelValues;
  centers: { id: string; name: string }[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [postal, setPostal] = useState(member.postalCode ?? "");
  // Los campos del drawer son no controlados: al reabrirlo hay que remontarlos
  // para que vuelvan a los valores del socio (Cancelar/Escape descarta el borrador).
  const [formKey, setFormKey] = useState(0);
  const [saving, startSaving] = useTransition();
  const toast = useToast();

  const draftArea = postalAreaLabel(postal.length === 5 ? postal : null);

  const openDrawer = useCallback(() => {
    setPostal(member.postalCode ?? "");
    setFormKey((k) => k + 1);
    setDrawerOpen(true);
  }, [member.postalCode]);

  // "Editar datos" de la cabecera abre este mismo drawer.
  useFocusRequest("edit", openDrawer);

  function handleSave(fd: FormData) {
    startSaving(async () => {
      const result = await updateMemberData(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDrawerOpen(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      toast.success("Datos del socio guardados.");
    });
  }

  const years = age(member.birthDate);

  return (
    <>
      <div className="flex flex-col gap-3">
        {savedFlash && (
          <span
            className="self-start inline-flex items-center gap-1 rounded-pill bg-good-bg text-good px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[0.04em]"
            style={{ animation: "tzPop .45s var(--ease-spring) both" }}
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" strokeDasharray="30" style={{ animation: "tzDraw .5s var(--ease-out-soft) .1s both" }} />
            </svg>
            Guardado
          </span>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 gap-x-7">
          <DataField label="Email" value={member.email} />
          <DataField label="Teléfono" value={member.phone} nums />
          <DataField
            label="Nacimiento"
            value={member.birthDate ? `${fmtDay(member.birthDate)}${years != null ? ` · ${years} años` : ""}` : null}
            nums
          />
          <DataField label="Dirección" value={member.address} />
          <DataField label="Código postal" value={member.postalCode} nums />
          <DataField
            label="Barrio / zona"
            value={member.postalCode ? <AreaChip postalCode={member.postalCode} /> : null}
          />
          <DataField label="Contacto de emergencia" value={member.emergencyContact} />
          <DataField
            label="Centro"
            value={member.primaryCenterName}
            hint={member.primaryCenterAddress ?? undefined}
          />
          <DataField label="Ocupación" value={member.occupation} />
        </div>

        <p className="text-[11px] text-brand-faint">
          El barrio se deduce del código postal (Zaragoza capital) y alimenta el mapa de calor del panel.
        </p>
      </div>

      {/* ---- Drawer de edición ---- */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        kicker="Ficha del socio"
        title="Editar datos"
        widthClassName="sm:w-[540px]"
      >
        <form key={formKey} action={handleSave}>
          <input type="hidden" name="memberId" value={member.id} />
          <div className="p-6 sm:p-7 flex flex-col gap-[18px]">
            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
              <Field label="Nombre">
                <Input name="firstName" defaultValue={member.firstName} required />
              </Field>
              <Field label="Apellidos">
                <Input name="lastName" defaultValue={member.lastName} required />
              </Field>
              <Field label="Email" className="col-span-full">
                <Input name="email" type="email" defaultValue={member.email} required />
              </Field>
              <Field label="Teléfono">
                <Input name="phone" defaultValue={member.phone ?? ""} />
              </Field>
              <Field label="Fecha de nacimiento">
                <Input name="birthDate" type="date" defaultValue={member.birthDate ?? ""} />
              </Field>
              <Field label="Sexo">
                <Select name="sex" defaultValue={member.sex ?? ""}>
                  <option value="">Sin especificar</option>
                  <option value="FEMALE">Mujer</option>
                  <option value="MALE">Hombre</option>
                  <option value="OTHER">Otro</option>
                </Select>
              </Field>
              <Field label="Ocupación">
                <Input name="occupation" defaultValue={member.occupation ?? ""} />
              </Field>
              <Field label="Centro principal" className="col-span-full">
                <Select name="centerId" defaultValue={member.primaryCenterId}>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Contacto de emergencia" className="col-span-full">
                <Input name="emergencyContact" defaultValue={member.emergencyContact ?? ""} />
              </Field>
            </div>

            <div className="border border-tz-sand rounded-[14px] bg-tz-bone/50 p-4">
              <div className={`${KICKER} mb-3`}>Dirección</div>
              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] gap-3">
                <Field label="Calle y número" className="col-span-full">
                  <Input name="address" defaultValue={member.address ?? ""} />
                </Field>
                <Field label="Dirección (línea 2)" className="col-span-full">
                  <Input name="addressLine2" defaultValue={member.addressLine2 ?? ""} />
                </Field>
                <Field label="Código postal">
                  <Input
                    name="postalCode"
                    value={postal}
                    onChange={(e) => setPostal(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="50008"
                    className="tz-nums"
                  />
                </Field>
                {/* Campo derivado: se rellena solo a partir del CP, no se guarda. */}
                <Field label="Barrio / zona">
                  <div
                    className={`rounded-control border border-dashed border-brand-border bg-white px-3.5 py-2.5 text-sm ${
                      draftArea ? "text-brand-text" : "text-faint"
                    }`}
                  >
                    {draftArea ?? (postal.length === 5 ? "CP no reconocido" : "Introduce el CP")}
                  </div>
                </Field>
                <Field label="Ciudad">
                  <Input name="city" defaultValue={member.city ?? ""} />
                </Field>
                <Field label="Provincia">
                  <Input name="province" defaultValue={member.province ?? ""} />
                </Field>
                <Field label="País">
                  <Input name="country" defaultValue={member.country ?? ""} />
                </Field>
              </div>
              <p className="text-xs text-brand-muted mt-3">
                El barrio se rellena solo a partir del CP. Fuera de Zaragoza capital se guarda solo el código postal.
              </p>
            </div>

            <div className="bg-tz-bone border border-brand-border rounded-xl px-4 py-3.5 text-[13px] text-brand-text-2 flex gap-2.5 items-start">
              <span className="w-2 h-2 rounded-full bg-apta-gold mt-1.5 shrink-0" />
              <span>
                Los consentimientos no se editan aquí: los firma el propio socio desde su portal. Cada cambio de ficha
                queda registrado en Auditoría.
              </span>
            </div>
          </div>

          <DrawerFooter>
            <Button type="button" variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <ButtonSpinner />}
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DrawerFooter>
        </form>
      </Drawer>

    </>
  );
}

/**
 * Zona de riesgo: solo la ve quien puede borrar socios (`canDeleteMembers`). Va
 * al final de la sección "Socio", después de salud y consentimientos.
 */
export function DeleteMemberSection({
  member,
  activeSubscriptionPlan,
}: {
  member: { id: string; firstName: string; lastName: string; email: string };
  activeSubscriptionPlan: string | null;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function handleDelete() {
    startDeleting(async () => {
      const result = await deleteMember(member.id);
      if (result.ok) {
        toast.success("Socio eliminado.");
        setDeleteOpen(false);
        router.replace("/members");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <section className="border border-[#e0cfc6] rounded-card px-5 py-[18px] bg-[linear-gradient(180deg,rgba(244,221,210,.28),rgba(255,255,255,0)_70%)]">
        <div className="flex items-center gap-2.5">
          <span className={`${BAR} bg-critical`} />
          <span className={`${KICKER} text-critical`}>Zona de riesgo</span>
        </div>
        <p className="text-[13px] text-brand-text-2 leading-relaxed mt-2.5">
          Eliminar el socio borra su ficha, su bitácora y su historial de asistencia de forma permanente.
        </p>
        <div
          className="relative mt-3.5 max-w-sm"
          onMouseEnter={() => activeSubscriptionPlan && setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
        >
          {tooltipVisible && activeSubscriptionPlan && (
            <div
              role="tooltip"
              className="absolute bottom-[calc(100%+9px)] left-0 right-0 z-20 bg-tz-black text-tz-bone rounded-[11px] px-[13px] py-[11px] text-[12.5px] leading-[1.45] shadow-pop"
              style={{ animation: "tzRowIn .18s var(--ease-out-soft) both" }}
            >
              No se puede eliminar un socio con suscripción activa. Programa primero la baja en{" "}
              <span className="text-apta-gold font-semibold">Plan y pagos</span>.
            </div>
          )}
          {activeSubscriptionPlan ? (
            <button
              type="button"
              disabled
              className="w-full rounded-control px-4 py-[11px] text-sm font-semibold bg-white border border-[#e0cfc6] text-faint opacity-65 cursor-not-allowed"
            >
              Eliminar socio
            </button>
          ) : (
            <Button
              type="button"
              variant="danger"
              onClick={() => setDeleteOpen(true)}
              className="w-full px-4 py-[11px] text-sm hover:shadow-[0_10px_28px_-12px_rgba(138,52,32,.5)] active:scale-[.985]"
            >
              Eliminar socio
            </Button>
          )}
        </div>
      </section>

      {/* ---- Confirmación de borrado (solo sin suscripción viva) ---- */}
      <ConfirmDialog
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        pending={deleting}
        kicker="Acción irreversible"
        title="Eliminar socio"
        confirmLabel="Sí, eliminar"
        pendingLabel="Eliminando..."
        description={
          <>
            <p>
              Vas a eliminar la ficha de{" "}
              <strong className="font-semibold text-brand-text">
                {member.firstName} {member.lastName}
              </strong>{" "}
              ({member.email}). Se borrarán sus datos de contacto, su bitácora, sus objetivos y su historial de
              asistencia.
            </p>
            <div className="border border-brand-border rounded-xl bg-tz-bone px-[15px] py-[13px] text-[12.5px] text-brand-text-2 flex gap-2.5 items-start mt-4">
              <span className="w-2 h-2 rounded-full bg-apta-gold mt-1.5 shrink-0" />
              <span>
                RGPD: los datos de salud y los pagos emitidos se conservan anonimizados por obligación legal. El
                borrado queda registrado en Auditoría con tu usuario.
              </span>
            </div>
          </>
        }
      />
    </>
  );
}

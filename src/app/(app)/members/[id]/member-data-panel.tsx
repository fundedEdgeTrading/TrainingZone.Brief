"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { MEMBER_STATE_COLOR, MEMBER_STATE_LABEL } from "@/lib/chart-colors";
import { postalAreaLabel } from "@/lib/postal-codes";
import { deleteMember, updateMemberData } from "./actions";

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

const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted";
const KICKER = "font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted";
const BAR = "w-1.5 h-[18px] rounded-[2px] shrink-0";
const CARD = "border border-brand-border rounded-card bg-white";

// Formateo propio (sin toLocaleDateString) para que servidor y cliente pinten
// exactamente lo mismo: el ICU de Node y el del navegador no coinciden en las
// abreviaturas de mes en es-ES ("sept." vs "sep.") y eso rompe la hidratación.
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtShort(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtDay(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Antigüedad en formato "Na Nm" desde el alta. */
function seniority(iso: string) {
  const from = new Date(iso);
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  return years > 0 ? `${years}a ${months % 12}m` : `${months}m`;
}

function ReadCell({ label, value, wrap }: { label: string; value: React.ReactNode; wrap?: boolean }) {
  return (
    <div className="p-3 rounded-xl transition-colors duration-[180ms] hover:bg-tz-bone">
      <div className={LABEL}>{label}</div>
      <div className={`text-[15px] text-brand-text mt-1 ${wrap ? "[overflow-wrap:anywhere]" : ""}`}>{value ?? "—"}</div>
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

function ConsentRow({ label, at }: { label: string; at: string | null }) {
  return (
    <li className="flex items-center justify-between gap-3 px-2 py-[9px] rounded-[10px] hover:bg-tz-bone transition-colors duration-[180ms]">
      <span className="flex items-center gap-2.5">
        <span className={`w-[7px] h-[7px] rounded-[2px] ${at ? "bg-good" : "bg-brand-border"}`} />
        <span className={`text-sm ${at ? "text-brand-text-2" : "text-faint"}`}>{label}</span>
      </span>
      {at ? (
        <span className="text-[13px] text-brand-text tz-nums">{fmtShort(at)}</span>
      ) : (
        <span className="text-[13px] text-faint">No</span>
      )}
    </li>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-brand-border rounded-[14px] bg-white px-[15px] py-3.5 transition-[border-color,box-shadow,transform] duration-200 ease-out-soft hover:border-brand-ink hover:shadow-hover hover:-translate-y-0.5">
      <div className={LABEL}>{label}</div>
      {children}
    </div>
  );
}

export function MemberDataPanel({
  member,
  centers,
  stats,
  activeSubscriptionPlan,
  canDelete,
}: {
  member: MemberDataPanelValues;
  centers: { id: string; name: string }[];
  stats: { attended: number; noShow: number };
  activeSubscriptionPlan: string | null;
  canDelete: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [postal, setPostal] = useState(member.postalCode ?? "");
  // Los campos del drawer son no controlados: al reabrirlo hay que remontarlos
  // para que vuelvan a los valores del socio (Cancelar/Escape descarta el borrador).
  const [formKey, setFormKey] = useState(0);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const draftArea = postalAreaLabel(postal.length === 5 ? postal : null);

  function openDrawer() {
    setPostal(member.postalCode ?? "");
    setFormKey((k) => k + 1);
    setDrawerOpen(true);
  }

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
      <div className="grid gap-[18px] items-start [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="flex flex-col gap-[18px]">
          {/* ---- Datos de contacto (lectura) ---- */}
          <section
            className={`${CARD} relative overflow-hidden`}
            style={{ animation: "tzRowIn .4s var(--ease-out-soft) .04s both" }}
          >
            <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-tz-sand bg-tz-bone/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`${BAR} bg-tz-black`} />
                <span className={KICKER}>Datos de contacto</span>
                {savedFlash && (
                  <span
                    className="inline-flex items-center gap-1 rounded-pill bg-good-bg text-good px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[0.04em]"
                    style={{ animation: "tzPop .45s var(--ease-spring) both" }}
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path
                        d="M20 6 9 17l-5-5"
                        strokeDasharray="30"
                        style={{ animation: "tzDraw .5s var(--ease-out-soft) .1s both" }}
                      />
                    </svg>
                    Guardado
                  </span>
                )}
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={openDrawer} className="shrink-0">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Editar datos
              </Button>
            </header>

            <div className="px-2 pt-1.5 pb-2.5">
              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                <ReadCell label="Email" value={member.email} wrap />
                <ReadCell label="Teléfono" value={member.phone} />
                <ReadCell
                  label="Fecha de nacimiento"
                  value={member.birthDate ? <span className="tz-nums">{fmtDay(member.birthDate)}</span> : null}
                />
                <ReadCell label="Contacto de emergencia" value={member.emergencyContact} />
              </div>
              <div className="mx-3 my-1.5 border-t border-dashed border-tz-sand" />
              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                <ReadCell label="Dirección" value={member.address} wrap />
                <ReadCell
                  label="Código postal"
                  value={member.postalCode ? <span className="tz-nums">{member.postalCode}</span> : null}
                />
                <ReadCell
                  label="Barrio / zona"
                  value={member.postalCode ? <AreaChip postalCode={member.postalCode} /> : null}
                />
              </div>
              <p className="mx-3 mb-1.5 text-xs text-faint">
                El barrio se deduce del código postal (Zaragoza capital) y alimenta el mapa de calor del panel.
              </p>
            </div>

            {savedFlash && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 bottom-0 left-0 w-[45%] bg-[linear-gradient(105deg,transparent,rgba(200,171,114,.32)_50%,transparent)]"
                style={{ animation: "tzCardSheen 1.1s var(--ease-out-soft) both" }}
              />
            )}
          </section>

          {/* ---- Consentimientos (solo lectura: los firma el socio) ---- */}
          <section className={CARD} style={{ animation: "tzRowIn .4s var(--ease-out-soft) .1s both" }}>
            <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-tz-sand">
              <div className="flex items-center gap-2.5">
                <span className={`${BAR} bg-apta-gold`} />
                <span className={KICKER}>Consentimientos</span>
              </div>
              <span className="text-xs text-faint">Los firma el socio en su onboarding</span>
            </header>
            <ul className="px-3 pt-1.5 pb-3 list-none">
              <ConsentRow label="Contrato" at={member.consentContractAt} />
              <ConsentRow label="Datos de salud (Art. 9 RGPD)" at={member.consentHealthAt} />
              <ConsentRow label="Uso de imágenes (evolución)" at={member.consentImagesAt} />
              <ConsentRow label="Tratamiento con IA" at={member.consentAIAt} />
              <ConsentRow label="Marketing" at={member.consentMarketingAt} />
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-[18px]">
          {/* ---- Resumen rápido ---- */}
          <div
            className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5"
            style={{ animation: "tzRowIn .4s var(--ease-out-soft) .06s both" }}
          >
            <Tile label="Antigüedad">
              <div className="font-display font-extrabold text-[22px] text-brand-text tz-nums leading-tight mt-0.5">
                {seniority(member.joinedAt)}
              </div>
              <div className="text-xs text-faint">Alta {fmtDay(member.joinedAt)}</div>
            </Tile>
            <Tile label="Centro">
              <div className="font-extrabold text-base text-brand-text leading-tight mt-0.5">
                {member.primaryCenterName}
              </div>
              <div className="text-xs text-faint truncate">{member.primaryCenterAddress ?? "—"}</div>
            </Tile>
            <Tile label="Estado">
              <div className="flex items-center gap-2 mt-0.5">
                <span className="relative inline-flex w-[9px] h-[9px]">
                  <span
                    className="w-[9px] h-[9px] rounded-full"
                    style={{ background: MEMBER_STATE_COLOR[member.state] }}
                  />
                  {member.state === "ACTIVE" && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: MEMBER_STATE_COLOR[member.state],
                        animation: "tzPulseRing 2.6s ease-out infinite",
                      }}
                    />
                  )}
                </span>
                <span className="font-bold text-base text-brand-text leading-tight">
                  {MEMBER_STATE_LABEL[member.state] ?? member.state}
                </span>
              </div>
              <div className="text-xs text-faint">{activeSubscriptionPlan ?? "Sin suscripción activa"}</div>
            </Tile>
            <Tile label="Asistencia">
              <div className="font-display font-extrabold text-[22px] text-brand-text tz-nums leading-tight mt-0.5">
                {stats.attended}
              </div>
              <div className="text-xs text-faint">
                sesiones · {stats.noShow} no-shows
              </div>
            </Tile>
          </div>

          {/* ---- Zona de riesgo (solo dirección) ---- */}
          {canDelete && (
            <section
              className="border border-[#e0cfc6] rounded-card px-5 py-[18px] bg-[linear-gradient(180deg,rgba(244,221,210,.28),rgba(255,255,255,0)_70%)]"
              style={{ animation: "tzRowIn .4s var(--ease-out-soft) .18s both" }}
            >
              <div className="flex items-center gap-2.5">
                <span className={`${BAR} bg-critical`} />
                <span className={`${KICKER} text-critical`}>Zona de riesgo</span>
              </div>
              <p className="text-[13px] text-brand-text-2 leading-relaxed mt-2.5">
                Eliminar el socio borra su ficha, su bitácora y su historial de asistencia de forma permanente.
              </p>
              <div
                className="relative mt-3.5"
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
                    <span className="text-apta-gold font-semibold">Contratación</span>.
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
          )}
        </div>
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

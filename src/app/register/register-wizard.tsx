"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { ImageDropzone } from "@/components/ui/dropzone";
import { registerOrganization, type RegisterResult } from "./actions";

const STEP_DEFS = [
  { label: "Empresa", sub: "Nombre, CIF y logo" },
  { label: "Centros", sub: "Sedes de la organización" },
  { label: "Personal", sub: "Equipo y roles" },
  { label: "Socios", sub: "Primeras altas" },
  { label: "Resumen", sub: "Confirmación" },
];

const STAFF_ROLES = ["Entrenador", "Recepción", "Dirección de centro", "RRHH"];

type CenterDraft = { name: string; address: string };
type StaffDraft = { name: string; email: string; role: string };
type MemberDraft = { name: string; email: string; centerIndex: number };

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export default function RegisterWizard() {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [anim, setAnim] = useState<"tz-wiz-a" | "tz-wiz-b">("tz-wiz-a");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgCif, setOrgCif] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [centers, setCenters] = useState<CenterDraft[]>([]);
  const [staff, setStaff] = useState<StaffDraft[]>([]);
  const [members, setMembers] = useState<MemberDraft[]>([]);

  function goTo(n: number) {
    setAnim((a) => (a === "tz-wiz-a" ? "tz-wiz-b" : "tz-wiz-a"));
    setStep(n);
  }

  function goNext() {
    if (step === 1 && (!orgName.trim() || !orgEmail.trim())) {
      setError("Indica al menos el nombre de la empresa y el email de dirección.");
      return;
    }
    setError(null);
    if (step === 5) {
      startTransition(async () => {
        const res = await registerOrganization({
          orgName,
          orgCif,
          orgEmail,
          orgLogoUrl,
          centers,
          staff,
          members,
        });
        setResult(res);
        if (res.ok) setDone(true);
        else setError(res.error);
      });
      return;
    }
    goTo(step + 1);
  }

  function goBack() {
    setError(null);
    goTo(Math.max(1, step - 1));
  }

  if (done && result?.ok) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-tz-bone px-4 py-10">
        <div className="text-center tz-fade-up max-w-[520px]">
          <div className="w-[72px] h-[72px] rounded-full bg-good-bg text-good flex items-center justify-center mx-auto mb-5" style={{ animation: "tzPop .6s cubic-bezier(.34,1.4,.4,1) .1s both" }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-display font-extrabold text-[28px] uppercase tracking-[-.01em]">¡{result.orgName} ya está en marcha!</h1>
          <p className="text-sm text-muted mt-2.5 max-w-[440px] mx-auto">
            Hemos enviado {result.staffCount + result.membersCount + 1} invitaciones. Cada persona recibirá su email
            con el enlace para crear su contraseña{result.membersCount > 0 ? " y firmar los consentimientos" : ""}.
          </p>
          <div className="flex gap-3 justify-center mt-7 flex-wrap">
            <Link
              href={result.ownerOnboardingUrl.replace(/^https?:\/\/[^/]+/, "")}
              className="no-underline font-semibold bg-white text-tz-black border border-tz-linen rounded-control px-[22px] py-3 text-sm transition-colors duration-200 hover:border-brand-ink hover:bg-tz-bone"
            >
              Crear mi acceso de dirección →
            </Link>
            <Link
              href="/login"
              className="no-underline inline-flex items-center gap-2 font-semibold bg-tz-black text-tz-bone rounded-control px-6 py-3 text-[15px] transition-colors duration-200 hover:bg-brand-ink-soft"
            >
              Ir al login →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex bg-tz-bone overflow-hidden">
      <div className="hidden lg:flex relative w-[360px] shrink-0 bg-tz-black overflow-hidden flex-col p-12">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="tz-aurora-blob tz-aurora-a" />
          <div className="tz-aurora-blob tz-aurora-b" />
        </div>
        <div className="relative z-10">
          <Link href="/login" className="no-underline inline-flex items-baseline font-display font-extrabold text-[34px] tracking-[-.02em] text-tz-bone">
            Apta<span aria-hidden="true" className="w-[0.16em] h-[0.16em] ml-[0.1em] rounded-full inline-block" style={{ background: "linear-gradient(135deg,#E3CFA2,#B58E52)", animation: "aptaDotPulse 3.2s ease-in-out 1.4s infinite" }} />
          </Link>
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted mt-7 mb-4">Nueva organización</div>
          <div className="flex flex-col gap-1">
            {STEP_DEFS.map((s, i) => {
              const n = i + 1;
              const active = !done && step === n;
              const complete = done || step > n;
              return (
                <div
                  key={s.label}
                  className={clsx("flex items-center gap-3.5 px-3 py-2.5 rounded-[10px] transition-colors duration-300 tz-fade-up", active && "bg-tz-bone/[.08]")}
                  style={{ animationDelay: `${(0.1 + i * 0.06).toFixed(2)}s` }}
                >
                  <span
                    className={clsx(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border transition-all duration-300",
                      complete ? "bg-apta-gold border-apta-gold text-tz-black" : active ? "bg-tz-bone border-tz-bone text-tz-black" : "bg-transparent border-brand-border-dark text-muted"
                    )}
                  >
                    {complete ? "✓" : n}
                  </span>
                  <span>
                    <span className={clsx("block text-sm font-semibold transition-colors duration-300", active ? "text-tz-bone" : complete ? "text-tz-linen" : "text-muted")}>
                      {s.label}
                    </span>
                    <span className="block text-[11px] text-muted">{s.sub}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative z-10 mt-auto text-xs text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-apta-gold font-semibold hover:text-[#E3CFA2] no-underline">
            Inicia sesión
          </Link>
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center px-4 sm:px-6 py-10">
          <div className="w-full max-w-[640px]">
            <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted mb-1.5 lg:hidden">
              Nueva organización
            </div>
            <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted mb-1.5">
              Paso {step} de 5
            </div>
            <div className="h-1 rounded-pill bg-tz-sand mb-6 overflow-hidden">
              <div className="h-full rounded-pill bg-tz-black transition-[width] duration-500 ease-out-soft" style={{ width: `${step * 20}%` }} />
            </div>

            {step === 1 && (
              <div key="s1" className={anim}>
                <h1 className="font-display font-extrabold text-[26px] uppercase tracking-[-.01em]">Datos de la empresa</h1>
                <p className="text-sm text-muted mt-1.5 mb-6">
                  Cuéntanos quién eres. El logo aparecerá en la barra de navegación y en los emails a tus socios.
                </p>
                <div className="bg-white border border-tz-linen rounded-card shadow-pop p-8 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-6">
                  <ImageDropzone name="orgLogo" label="Logo" shape="rounded" sizeClassName="w-[120px] h-[120px]" onChange={setOrgLogoUrl} />
                  <div className="flex flex-col gap-4">
                    <Field label="Nombre de la empresa">
                      <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="p.ej. Training Zone" />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="CIF">
                        <Input value={orgCif} onChange={(e) => setOrgCif(e.target.value)} placeholder="B-12345678" />
                      </Field>
                      <Field label="Email de dirección">
                        <Input type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} placeholder="direccion@empresa.es" />
                      </Field>
                    </div>
                    <p className="text-xs text-muted">
                      Este email será la cuenta de <b>Dirección de organización</b> — la única con permiso para crear
                      personal y otros roles.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div key="s2" className={anim}>
                <h1 className="font-display font-extrabold text-[26px] uppercase tracking-[-.01em]">Añade tus centros</h1>
                <p className="text-sm text-muted mt-1.5 mb-6">
                  Cada centro tiene su propia agenda, equipo y socios. Podrás añadir más después.
                </p>
                <div className="flex flex-col gap-2.5 mb-3.5">
                  {centers.map((c, i) => (
                    <div key={i} className="flex items-center gap-3.5 bg-white border border-tz-linen rounded-xl px-[18px] py-3.5 shadow-card tz-fade-up">
                      <span className="w-9 h-9 rounded-[10px] bg-tz-sand flex items-center justify-center font-bold text-[13px] text-text-2 shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-tz-black">{c.name}</span>
                        <span className="block text-xs text-muted">{c.address || "Sin dirección"}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCenters((cs) => cs.filter((_, j) => j !== i))}
                        aria-label="Eliminar centro"
                        className="w-7 h-7 rounded-full text-faint hover:bg-critical-bg hover:text-critical transition-colors duration-150 text-[15px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const name = (f.elements.namedItem("cname") as HTMLInputElement).value.trim();
                    const address = (f.elements.namedItem("caddr") as HTMLInputElement).value.trim();
                    if (!name) return;
                    setCenters((cs) => [...cs, { name, address }]);
                    f.reset();
                  }}
                  className="bg-white border border-dashed border-brand-border-hover rounded-card p-5 grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto] gap-3 items-end"
                >
                  <Field label="Nombre del centro">
                    <Input name="cname" placeholder="p.ej. Centro Norte" />
                  </Field>
                  <Field label="Dirección">
                    <Input name="caddr" placeholder="Calle, número, ciudad" />
                  </Field>
                  <Button type="submit" variant="secondary">
                    + Añadir
                  </Button>
                </form>
              </div>
            )}

            {step === 3 && (
              <div key="s3" className={anim}>
                <h1 className="font-display font-extrabold text-[26px] uppercase tracking-[-.01em]">Añade a tu personal</h1>
                <p className="text-sm text-muted mt-1.5 mb-6">
                  Cada persona recibirá un email de invitación para crear su contraseña. Solo la dirección de
                  organización puede crear estos roles.
                </p>
                <div className="flex flex-col gap-2.5 mb-3.5">
                  {staff.map((p, i) => (
                    <div key={i} className="flex items-center gap-3.5 bg-white border border-tz-linen rounded-xl px-[18px] py-3.5 shadow-card tz-fade-up">
                      <span className="w-9 h-9 rounded-full bg-tz-sand flex items-center justify-center font-bold text-xs text-text-2 shrink-0">
                        {initials(p.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-tz-black">{p.name}</span>
                        <span className="block text-xs text-muted">{p.email}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-tz-sand px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-text-2">
                        {p.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => setStaff((s) => s.filter((_, j) => j !== i))}
                        aria-label="Eliminar persona"
                        className="w-7 h-7 rounded-full text-faint hover:bg-critical-bg hover:text-critical transition-colors duration-150 text-[15px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const name = (f.elements.namedItem("pname") as HTMLInputElement).value.trim();
                    const email = (f.elements.namedItem("pemail") as HTMLInputElement).value.trim();
                    const role = (f.elements.namedItem("prole") as HTMLSelectElement).value;
                    if (!name || !email) return;
                    setStaff((s) => [...s, { name, email, role }]);
                    f.reset();
                  }}
                  className="bg-white border border-dashed border-brand-border-hover rounded-card p-5 grid grid-cols-1 sm:grid-cols-[1.1fr_1.2fr_1fr_auto] gap-3 items-end"
                >
                  <Field label="Nombre">
                    <Input name="pname" placeholder="Nombre y apellidos" />
                  </Field>
                  <Field label="Email">
                    <Input name="pemail" type="email" placeholder="persona@empresa.es" />
                  </Field>
                  <Field label="Rol">
                    <Select name="prole" defaultValue={STAFF_ROLES[0]}>
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" variant="secondary">
                    + Añadir
                  </Button>
                </form>
              </div>
            )}

            {step === 4 && (
              <div key="s4" className={anim}>
                <h1 className="font-display font-extrabold text-[26px] uppercase tracking-[-.01em]">Añade tus primeros socios</h1>
                <p className="text-sm text-muted mt-1.5 mb-6">
                  Al terminar, cada socio recibirá un email de bienvenida con un enlace para crear su contraseña y
                  firmar los consentimientos. También puedes importarlos después.
                </p>
                <div className="flex flex-col gap-2.5 mb-3.5">
                  {members.map((m, i) => (
                    <div key={i} className="flex items-center gap-3.5 bg-white border border-tz-linen rounded-xl px-[18px] py-3.5 shadow-card tz-fade-up">
                      <span className="w-9 h-9 rounded-full bg-tz-sand flex items-center justify-center font-bold text-xs text-text-2 shrink-0">
                        {initials(m.name)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-tz-black">{m.name}</span>
                        <span className="block text-xs text-muted">
                          {m.email} · {centers[m.centerIndex]?.name ?? "—"}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-trial-bg px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] text-trial">
                        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                        Email pendiente
                      </span>
                      <button
                        type="button"
                        onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}
                        aria-label="Eliminar socio"
                        className="w-7 h-7 rounded-full text-faint hover:bg-critical-bg hover:text-critical transition-colors duration-150 text-[15px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const name = (f.elements.namedItem("mname") as HTMLInputElement).value.trim();
                    const email = (f.elements.namedItem("memail") as HTMLInputElement).value.trim();
                    const centerIndex = Number((f.elements.namedItem("mcenter") as HTMLSelectElement).value);
                    if (!name || !email || centers.length === 0) return;
                    setMembers((ms) => [...ms, { name, email, centerIndex }]);
                    f.reset();
                  }}
                  className="bg-white border border-dashed border-brand-border-hover rounded-card p-5 grid grid-cols-1 sm:grid-cols-[1.1fr_1.2fr_1fr_auto] gap-3 items-end"
                >
                  <Field label="Nombre">
                    <Input name="mname" placeholder="Nombre y apellidos" disabled={centers.length === 0} />
                  </Field>
                  <Field label="Email">
                    <Input name="memail" type="email" placeholder="socio@email.es" disabled={centers.length === 0} />
                  </Field>
                  <Field label="Centro">
                    <Select name="mcenter" disabled={centers.length === 0}>
                      {centers.length === 0 ? (
                        <option>— sin centros —</option>
                      ) : (
                        centers.map((c, i) => (
                          <option key={i} value={i}>
                            {c.name}
                          </option>
                        ))
                      )}
                    </Select>
                  </Field>
                  <Button type="submit" variant="secondary" disabled={centers.length === 0}>
                    + Añadir
                  </Button>
                </form>
                {centers.length === 0 && (
                  <p className="text-xs text-critical mt-2">Vuelve al paso 2 y añade un centro antes de dar de alta socios.</p>
                )}
              </div>
            )}

            {step === 5 && (
              <div key="s5" className={anim}>
                <h1 className="font-display font-extrabold text-[26px] uppercase tracking-[-.01em]">Resumen</h1>
                <p className="text-sm text-muted mt-1.5 mb-6">Revisa que todo esté correcto antes de crear la organización.</p>
                <div className="bg-white border border-tz-linen rounded-card shadow-pop overflow-hidden">
                  <div className="bg-tz-black px-7 py-[22px]">
                    <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-tz-linen">Organización</div>
                    <div className="font-display font-extrabold text-2xl uppercase text-tz-bone mt-1">{orgName || "Mi empresa"}</div>
                    <div className="text-[13px] text-muted mt-0.5">{orgCif || "CIF pendiente"} · {orgEmail || "direccion@empresa.es"}</div>
                  </div>
                  <div className="grid grid-cols-3 border-t border-tz-sand">
                    <div className="px-7 py-5 border-r border-tz-sand">
                      <div className="font-display font-extrabold text-[28px] tz-nums">{centers.length}</div>
                      <div className="text-xs text-muted">Centros</div>
                    </div>
                    <div className="px-7 py-5 border-r border-tz-sand">
                      <div className="font-display font-extrabold text-[28px] tz-nums">{staff.length}</div>
                      <div className="text-xs text-muted">Personal</div>
                    </div>
                    <div className="px-7 py-5">
                      <div className="font-display font-extrabold text-[28px] tz-nums">{members.length}</div>
                      <div className="text-xs text-muted">Socios</div>
                    </div>
                  </div>
                  <div className="px-7 py-4 border-t border-tz-sand bg-tz-bone text-[13px] text-text-2 flex gap-2.5 items-start">
                    <span className="w-2 h-2 rounded-full bg-apta-gold shrink-0 mt-[5px]" />
                    Al confirmar se enviarán los emails de invitación al personal y de bienvenida a los socios, con
                    su enlace de acceso individual.
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2 mt-4">{error}</p>}

            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                onClick={goBack}
                className={clsx("font-semibold bg-transparent text-text-2 rounded-control px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-tz-linen/40", step === 1 && "invisible")}
              >
                ← Atrás
              </button>
              <Button size="lg" onClick={goNext} disabled={pending}>
                {pending && <ButtonSpinner />}
                {pending ? "Creando..." : step === 5 ? "Crear organización ✓" : "Continuar →"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

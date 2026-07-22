"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import clsx from "clsx";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { completeMemberOnboarding, completeStaffOnboarding } from "./actions";

type Props = {
  token: string;
  type: "MEMBER" | "STAFF";
  firstName: string;
  email: string;
  orgName: string;
  orgLogoUrl: string;
  contextLabel: string;
};

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
  if (p.length >= 12 || /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

const STRENGTH_COLORS = ["#E7DFD2", "#C0392B", "#C8AB72", "#4B5A22"];
const STRENGTH_LABELS = ["Demasiado corta", "Débil", "Aceptable", "Fuerte"];

const CONSENT_DEFS = [
  {
    key: "health" as const,
    title: "Datos de salud",
    tag: "Obligatorio ✱",
    tagClass: "bg-critical-bg text-critical",
    desc: "Tratamiento de datos de salud (lesiones, composición corporal, historial físico) para diseñar y adaptar tu entrenamiento. Art. 9.2.a RGPD.",
  },
  {
    key: "contract" as const,
    title: "Contrato de servicios",
    tag: "Obligatorio ✱",
    tagClass: "bg-critical-bg text-critical",
    desc: "Aceptación de las condiciones del servicio de entrenamiento y la política de reservas y cancelaciones.",
  },
  {
    key: "images" as const,
    title: "Uso de imágenes",
    tag: "Opcional",
    tagClass: "bg-tz-sand text-text-2",
    desc: "Fotos de evolución física, visibles solo para ti y tu entrenador. Sin esto no podremos guardar tu galería de progreso.",
  },
  {
    key: "marketing" as const,
    title: "Comunicaciones",
    tag: "Opcional",
    tagClass: "bg-tz-sand text-text-2",
    desc: "Novedades del centro, eventos y promociones por email. Puedes darte de baja con un clic.",
  },
];

export default function OnboardingForm({ token, type, firstName, email, orgName, orgLogoUrl, contextLabel }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"pass" | "consent" | "done">("pass");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [consents, setConsents] = useState({ health: false, contract: false, images: false, marketing: false });
  const [sex, setSex] = useState<"" | "FEMALE" | "MALE" | "OTHER">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const str = strength(pass1);
  const mismatch = pass2.length > 0 && pass1 !== pass2;
  const passOk = pass1.length >= 8 && pass1 === pass2;
  const consentOk = consents.health && consents.contract;

  function fill(i: number) {
    return pass1 && str >= i ? STRENGTH_COLORS[Math.max(str, 1)] : STRENGTH_COLORS[0];
  }

  async function finish() {
    setPending(true);
    setError(null);
    const result =
      type === "STAFF"
        ? await completeStaffOnboarding(token, pass1)
        : await completeMemberOnboarding(token, {
            password: pass1,
            consentHealth: consents.health,
            consentImages: consents.images,
            consentMarketing: consents.marketing,
            sex,
          });

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    const signInRes = await signIn("demo", { email, password: pass1, redirect: false });
    setPending(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    setPhase("done");
    setCountdown(3);
  }

  useEffect(() => {
    if (phase !== "done" || countdown === null) return;
    if (countdown <= 0) {
      router.push("/");
      router.refresh();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, router]);

  const destinationLabel = type === "MEMBER" ? "Mi Actividad" : "el panel";

  return (
    <div className="min-h-dvh bg-tz-black relative overflow-hidden flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="tz-aurora-blob tz-aurora-a" />
        <div className="tz-aurora-blob tz-aurora-b" />
      </div>
      <div className="relative z-10 w-full max-w-[520px] tz-fade-up">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización */}
          <img src={orgLogoUrl} alt={orgName} className="h-[34px] w-auto object-contain inline-block" />
        </div>

        {phase !== "done" && type === "MEMBER" && (
          <div className="flex justify-center gap-2 mb-5">
            <span className="w-9 h-[5px] rounded-pill bg-tz-black" />
            <span className={clsx("w-9 h-[5px] rounded-pill transition-colors duration-300", phase === "pass" ? "bg-tz-linen" : "bg-tz-black")} />
          </div>
        )}

        <div className="bg-white border border-tz-linen rounded-card shadow-pop p-9">
          {phase === "pass" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!passOk) return;
                if (type === "STAFF") finish();
                else setPhase("consent");
              }}
              className="tz-wiz-a"
            >
              <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted">
                {type === "MEMBER" ? "Paso 1 de 2" : "Crea tu contraseña"}
              </div>
              <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] mt-1.5">
                ¡Hola, {firstName}!
                <br />
                Crea tu contraseña
              </h1>
              <p className="text-sm text-muted mt-2 mb-5">
                Tu cuenta <b className="text-text-2">{email}</b> ya está verificada
                {type === "STAFF" ? ` en ${orgName} (${contextLabel})` : ""}. Elige una contraseña para acceder
                {type === "MEMBER" ? " a tu portal." : "."}
              </p>
              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-1.5">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={pass1}
                    onChange={(e) => setPass1(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full rounded-control border border-brand-border px-3.5 py-2.5 text-sm focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none"
                  />
                  <div className="flex gap-1.5 mt-2">
                    {[1, 2, 3].map((i) => (
                      <span key={i} className="flex-1 h-1 rounded-pill transition-colors duration-300" style={{ background: fill(i) }} />
                    ))}
                  </div>
                  <div className="text-xs text-muted mt-1.5">
                    {!pass1 ? "Usa mayúsculas, números y símbolos para reforzarla." : STRENGTH_LABELS[str]}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-1.5">
                    Repite la contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={pass2}
                    onChange={(e) => setPass2(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-control border border-brand-border px-3.5 py-2.5 text-sm focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none"
                  />
                  {mismatch && <div className="text-xs text-critical mt-1.5">Las contraseñas no coinciden.</div>}
                </div>
                {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
                <Button type="submit" size="lg" disabled={!passOk || pending} className="mt-1.5">
                  {pending && <ButtonSpinner />}
                  {pending ? "Procesando..." : "Continuar →"}
                </Button>
              </div>
            </form>
          )}

          {phase === "consent" && type === "MEMBER" && (
            <div className="tz-wiz-a">
              <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted">Paso 2 de 2</div>
              <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] mt-1.5">Tus datos, tus reglas</h1>
              <p className="text-sm text-muted mt-2 mb-5">
                Para entrenar contigo de forma segura necesitamos tu consentimiento expreso. Puedes retirarlo en
                cualquier momento desde tu perfil.
              </p>
              <div className="mb-4">
                <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-1.5">
                  Sexo (opcional)
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as typeof sex)}
                  className="w-full rounded-control border border-brand-border px-3.5 py-2.5 text-sm focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none"
                >
                  <option value="">Prefiero no decirlo</option>
                  <option value="FEMALE">Mujer</option>
                  <option value="MALE">Hombre</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
              <div className="flex flex-col gap-2.5">
                {CONSENT_DEFS.map((c) => {
                  const checked = consents[c.key];
                  return (
                    <label
                      key={c.key}
                      className={clsx(
                        "flex gap-3.5 items-start rounded-xl px-4 py-3.5 cursor-pointer transition-colors duration-200 border",
                        checked ? "border-brand-ink bg-tz-bone" : "border-brand-border bg-white hover:border-brand-border-hover"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setConsents((s) => ({ ...s, [c.key]: !s[c.key] }))}
                        className="w-[18px] h-[18px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
                      />
                      <span>
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-tz-black">{c.title}</span>
                          <span className={clsx("rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]", c.tagClass)}>
                            {c.tag}
                          </span>
                        </span>
                        <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{c.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-faint leading-relaxed mt-3.5">
                Responsable: {orgName} · Finalidad: prestación del servicio de entrenamiento y seguimiento físico ·
                Base legal: consentimiento explícito (Art. 9.2.a RGPD) · Derechos: acceso, rectificación, supresión
                y portabilidad en privacidad@{orgName.toLowerCase().replace(/\s+/g, "")}.es.
              </p>
              {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2 mt-3">{error}</p>}
              <div className="flex justify-between items-center mt-5">
                <button
                  type="button"
                  onClick={() => setPhase("pass")}
                  className="font-semibold bg-transparent text-text-2 rounded-control px-3.5 py-2.5 text-sm transition-colors duration-200 hover:bg-tz-linen/40"
                >
                  ← Atrás
                </button>
                <Button size="lg" onClick={finish} disabled={!consentOk || pending}>
                  {pending && <ButtonSpinner />}
                  {pending ? "Guardando..." : "Guardar y entrar →"}
                </Button>
              </div>
              {!consentOk && (
                <p className="text-xs text-muted text-right mt-2">
                  Los consentimientos obligatorios (✱) son necesarios para continuar.
                </p>
              )}
            </div>
          )}

          {phase === "done" && (
            <div className="text-center tz-fade-up py-3">
              <div
                className="w-[72px] h-[72px] rounded-full bg-good-bg text-good flex items-center justify-center mx-auto mb-4.5"
                style={{ animation: "tzPop .6s cubic-bezier(.34,1.4,.4,1) .1s both" }}
              >
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="font-display font-extrabold text-[26px] uppercase tracking-[-.01em]">¡Todo listo, {firstName}!</h1>
              <p className="text-sm text-muted mt-2.5">
                Tu contraseña{type === "MEMBER" ? " y consentimientos" : ""} se han guardado.
                <br />
                Te llevamos a <b className="text-text-2">{destinationLabel}</b>
                {countdown ? ` en ${countdown}…` : "…"}
              </p>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-muted mt-4.5">
          Enlace de acceso personal · caduca en 7 días · <a href="/login" className="text-faint">Volver al login</a>
        </p>
      </div>
    </div>
  );
}

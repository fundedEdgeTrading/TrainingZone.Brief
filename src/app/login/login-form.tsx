"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { resolveLoginTargets, type LoginTarget } from "./actions";
import type { DemoAccess } from "./demo-users";

function initials(label: string) {
  const parts = label.replace(/—.*$/, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * PROD-01: el panel demo llega como DATOS desde el servidor (`demoAccess`), y
 * solo si el modo demo está encendido. Antes la lista de usuarios sembrados y
 * su contraseña eran constantes de este componente de cliente: el panel no se
 * pintaba en producción, pero las credenciales viajaban igual en el JS público.
 */
export default function LoginForm({ demoAccess }: { demoAccess: DemoAccess | null }) {
  const demoModeActive = demoAccess !== null;
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  // `requireSession` manda aquí con `?baja=1` a quien conserva la cookie pero
  // ya no está en plantilla (RB-RRHH-014). Sin este aviso, el reintento con
  // credenciales correctas devolvía "credenciales incorrectas" y parecía un
  // fallo de contraseña.
  const removedFromStaff = params.get("baja") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  // RB-ID-002: solo se rellena cuando la identidad tiene varias membresías.
  const [targets, setTargets] = useState<LoginTarget[] | null>(null);

  function reportBadCredentials() {
    setError("Credenciales incorrectas.");
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  async function doSignIn(loginEmail: string, loginPassword: string, orgId?: string) {
    setLoading(true);
    setError(null);
    const res = await signIn("demo", {
      email: loginEmail,
      password: loginPassword,
      ...(orgId ? { orgId } : {}),
      redirect: false,
    });
    if (res?.error) {
      setLoading(false);
      reportBadCredentials();
      return;
    }
    // `loading` se deja en true a propósito: la parte lenta es la navegación,
    // no el signIn. Si se apagara aquí el botón volvería a "Iniciar sesión"
    // justo cuando empieza la espera. El componente se desmonta al llegar.
    router.push(callbackUrl);
    router.refresh();
  }

  /**
   * Con una sola membresía —el caso de casi todo el mundo— se entra directo y
   * no se ve ningún paso intermedio. El selector solo aparece cuando el mismo
   * email pertenece a varias organizaciones.
   */
  async function startSignIn(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError(null);
    const result = await resolveLoginTargets(loginEmail, loginPassword);
    if (!result.ok) {
      setLoading(false);
      reportBadCredentials();
      return;
    }
    if (result.targets.length === 1) {
      await doSignIn(loginEmail, loginPassword, result.targets[0].orgId);
      return;
    }
    setLoading(false);
    setTargets(result.targets);
  }

  if (targets) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black">
            ¿Dónde quieres entrar?
          </h2>
          <p className="text-sm text-muted mt-1">Tu cuenta tiene acceso a varias organizaciones.</p>
        </div>
        <div className="space-y-2">
          {targets.map((t) => (
            <button
              key={t.orgId}
              type="button"
              disabled={loading}
              aria-busy={loading}
              onClick={() => doSignIn(email, password, t.orgId)}
              className="w-full flex items-center gap-3 text-left rounded-control border border-tz-linen hover:border-brand-border-hover hover:bg-tz-bone px-3 py-2.5 transition-colors duration-150"
            >
              <span className="w-8 h-8 rounded-full bg-tz-sand text-brand-text-2 font-display font-bold text-[11px] flex items-center justify-center shrink-0 overflow-hidden">
                {t.orgLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.orgLogoUrl} alt="" className="w-full h-full object-contain" />
                ) : (
                  t.orgName.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="text-sm font-medium text-tz-black">{t.orgName}</span>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
        <button
          type="button"
          onClick={() => setTargets(null)}
          className="text-xs text-muted underline"
        >
          ← Usar otra cuenta
        </button>
      </div>
    );
  }

  return (
    <div className={demoModeActive ? "grid gap-6 lg:grid-cols-[1fr_1px_1fr] lg:gap-7" : ""}>
      <div className="space-y-5 short:space-y-4">
        {removedFromStaff && (
          <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">
            Tu cuenta ya no tiene acceso a esta organización. Habla con la dirección de tu centro.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            startSignIn(email, password);
          }}
          className={`space-y-3 ${shake ? "tz-shake" : ""}`}
        >
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@trainingzone.es"
            />
          </Field>
          <Field label="Contraseña">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            aria-busy={loading}
            className="w-full relative overflow-hidden"
          >
            {loading && <ButtonSpinner />}
            {loading ? "Entrando..." : "Iniciar sesión"}
            {loading && (
              <span
                aria-hidden="true"
                className="absolute left-0 bottom-0 h-[3px] w-full origin-left"
                style={{
                  background: "linear-gradient(90deg,var(--color-apta-gold),var(--color-tz-sand))",
                  animation: "tzRouteBar 1.1s var(--ease-out-soft) both",
                }}
              />
            )}
          </Button>
          <p className="text-center">
            <Link href="/recuperar-clave" className="text-xs text-muted underline">
              He olvidado mi contraseña
            </Link>
          </p>
        </form>
      </div>

      {/* E8-16: el panel de acceso demo (usuarios sembrados con contraseña
          compartida a la vista) no puede salir en producción — es la primera
          pantalla de un producto que se vende como premium. */}
      {demoModeActive && demoAccess && (
        <>
          <div className="hidden lg:block bg-tz-linen/70" />

          <div>
            <p className="text-xs font-medium text-muted mb-2">
              O entra directamente como un usuario demo (contraseña:{" "}
              <code className="bg-tz-sand px-1 rounded">{demoAccess.password}</code>):
            </p>
            <div className="space-y-1.5">
              {demoAccess.users.map((u, i) => (
                <button
                  key={u.email}
                  type="button"
                  disabled={loading}
                  aria-busy={loading}
                  onClick={() => doSignIn(u.email, demoAccess.password)}
                  className="w-full flex items-center gap-3 text-left rounded-control border border-tz-linen hover:border-brand-border-hover hover:bg-tz-bone hover:-translate-y-0.5 hover:shadow-card px-3 py-2 short:py-1.5 transition-[transform,box-shadow,border-color,background-color] duration-150 tz-fade-up"
                  style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                >
                  <span className="w-8 h-8 rounded-full bg-tz-sand text-brand-text-2 font-display font-bold text-[11px] flex items-center justify-center shrink-0">
                    {initials(u.label)}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-tz-black">{u.label}</span>
                    <span className="block text-xs text-muted">{u.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

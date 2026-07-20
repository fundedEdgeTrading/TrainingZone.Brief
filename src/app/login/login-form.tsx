"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";

const DEMO_USERS = [
  {
    email: "sergio@trainingzone.es",
    label: "Sergio — Dirección",
    desc: "Ámbito global, todos los centros",
  },
  {
    email: "direccion.centro@trainingzone.es",
    label: "Dirección de centro",
    desc: "P&L y operativa de su centro",
  },
  {
    email: "entrenador@trainingzone.es",
    label: "Entrenador",
    desc: "Agenda, Session Brief y Debrief",
  },
  {
    email: "recepcion@trainingzone.es",
    label: "Recepción",
    desc: "Socios, agenda y cobros (sin datos de salud)",
  },
  {
    email: "socio@trainingzone.es",
    label: "Socio",
    desc: "Portal del socio: reservas y progreso",
  },
];

const DEMO_PASSWORD = "demo1234";

function initials(label: string) {
  const parts = label.replace(/—.*$/, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  async function doSignIn(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError(null);
    const res = await signIn("demo", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Credenciales incorrectas.");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1px_1fr] lg:gap-7">
      <div className="space-y-5 short:space-y-4">
        <button
          type="button"
          disabled
          title="Requiere un App Registration de Microsoft Entra ID configurado en producción"
          className="w-full flex items-center justify-center gap-2 rounded-control border border-tz-linen bg-tz-sand text-faint py-2.5 short:py-2 text-sm font-medium cursor-not-allowed opacity-60"
        >
          <MicrosoftLogo />
          Continuar con Microsoft
        </button>

        <div className="flex items-center gap-3 text-xs text-faint">
          <div className="h-px bg-tz-linen flex-1" />
          acceso demo
          <div className="h-px bg-tz-linen flex-1" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSignIn(email, password);
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
          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading && <ButtonSpinner />}
            {loading ? "Entrando..." : "Iniciar sesión"}
          </Button>
        </form>
      </div>

      <div className="hidden lg:block bg-tz-linen/70" />

      <div>
        <p className="text-xs font-medium text-muted mb-2">
          O entra directamente como un usuario demo (contraseña:{" "}
          <code className="bg-tz-sand px-1 rounded">{DEMO_PASSWORD}</code>):
        </p>
        <div className="space-y-1.5">
          {DEMO_USERS.map((u, i) => (
            <button
              key={u.email}
              type="button"
              disabled={loading}
              onClick={() => doSignIn(u.email, DEMO_PASSWORD)}
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
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

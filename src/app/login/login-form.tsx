"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

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

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        disabled
        title="Requiere un App Registration de Microsoft Entra ID configurado en producción"
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-400 py-2.5 text-sm font-medium cursor-not-allowed"
      >
        <MicrosoftLogo />
        Continuar con Microsoft
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px bg-slate-200 flex-1" />
        acceso demo
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSignIn(email, password);
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@trainingzone.es"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-sm font-medium transition disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Iniciar sesión"}
        </button>
      </form>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">
          O entra directamente como un usuario demo (contraseña:{" "}
          <code className="bg-slate-100 px-1 rounded">{DEMO_PASSWORD}</code>):
        </p>
        <div className="space-y-1.5">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              disabled={loading}
              onClick={() => doSignIn(u.email, DEMO_PASSWORD)}
              className="w-full text-left rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 px-3 py-2 transition"
            >
              <div className="text-sm font-medium text-slate-800">
                {u.label}
              </div>
              <div className="text-xs text-slate-500">{u.desc}</div>
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

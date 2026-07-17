import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-white text-2xl font-bold mb-4">
            TZ
          </div>
          <h1 className="text-2xl font-semibold text-white">TRAINING ZONE</h1>
          <p className="text-slate-300 text-sm mt-1">
            Plataforma de gestión de centros
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          El inicio de sesión con Microsoft (Entra ID) está integrado en el
          código y listo para activarse en cuanto exista un App Registration
          real en el tenant de Azure del cliente.
        </p>
      </div>
    </div>
  );
}

import Image from "next/image";
import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-tz-bone px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/brand/tz-logo-black.png"
            alt="Training Zone"
            width={220}
            height={37}
            priority
            className="h-9 w-auto mx-auto mb-4"
          />
          <p className="text-muted text-sm mt-1">
            Plataforma de gestión de centros
          </p>
        </div>

        <div className="bg-white border border-tz-linen rounded-2xl shadow-xl p-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-faint text-xs mt-6">
          El inicio de sesión con Microsoft (Entra ID) está integrado en el
          código y listo para activarse en cuanto exista un App Registration
          real en el tenant de Azure del cliente.
        </p>
      </div>
    </div>
  );
}

import Image from "next/image";
import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-tz-bone">
      <div className="hidden lg:flex relative w-[42%] shrink-0 bg-tz-black overflow-hidden flex-col justify-between p-12">
        <div className="relative z-10 tz-fade-up">
          <Image
            src="/brand/tz-logo-white.png"
            alt="Training Zone"
            width={220}
            height={37}
            priority
            className="h-8 w-auto"
          />
        </div>
        <div className="relative z-10 tz-fade-up" style={{ animationDelay: "0.1s" }}>
          <div className="font-display font-extrabold text-4xl uppercase leading-[1.05] tracking-[-.01em] text-tz-bone">
            Entrena.
            <br />
            Gestiona.
            <br />
            Crece.
          </div>
          <p className="text-sm text-brand-muted-2 mt-4 max-w-xs">
            La plataforma de gestión para centros de entrenamiento Training Zone.
          </p>
        </div>
        <div className="absolute -right-24 -bottom-24 w-[340px] h-[340px] rounded-full bg-brand-ink-soft/40" />
        <div className="absolute -right-10 top-1/3 w-[160px] h-[160px] rounded-full bg-brand-border-dark/40" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md tz-fade-up" style={{ animationDelay: "0.05s" }}>
          <div className="text-center mb-8 lg:hidden">
            <Image
              src="/brand/tz-logo-black.png"
              alt="Training Zone"
              width={220}
              height={37}
              priority
              className="h-9 w-auto mx-auto mb-4"
            />
          </div>
          <div className="mb-6 hidden lg:block">
            <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
              Bienvenido de vuelta
            </h1>
            <p className="text-sm text-muted mt-1">Accede a tu cuenta de Training Zone.</p>
          </div>

          <div className="bg-white border border-tz-linen rounded-card shadow-pop p-8">
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
    </div>
  );
}

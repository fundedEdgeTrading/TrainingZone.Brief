import { Suspense } from "react";
import LoginForm from "./login-form";
import AptaLogo from "./apta-logo";

export default function LoginPage() {
  return (
    <div className="h-dvh flex bg-tz-bone overflow-hidden">
      <div className="hidden lg:flex relative w-[42%] shrink-0 bg-tz-black overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="tz-aurora-blob tz-aurora-a" />
          <div className="tz-aurora-blob tz-aurora-b" />
          <div className="tz-aurora-blob tz-aurora-c" />
        </div>
        <div className="relative z-10">
          <AptaLogo variant="light" className="text-5xl" />
        </div>
        <div className="relative z-10">
          <div className="font-display font-extrabold text-4xl uppercase leading-[1.05] tracking-[-.01em] text-tz-bone">
            <span className="block tz-fade-up" style={{ animationDelay: "0.15s" }}>
              Entrena.
            </span>
            <span className="block tz-fade-up" style={{ animationDelay: "0.25s" }}>
              Gestiona.
            </span>
            <span className="block tz-fade-up" style={{ animationDelay: "0.35s" }}>
              Crece.
            </span>
          </div>
          <p
            className="text-sm text-brand-muted-2 mt-4 max-w-xs tz-fade-up"
            style={{ animationDelay: "0.45s" }}
          >
            La plataforma de gestión para centros de entrenamiento Training Zone.
          </p>
        </div>
        <div className="absolute -right-24 -bottom-24 w-[340px] h-[340px] rounded-full bg-brand-ink-soft/40 tz-float-slow" />
        <div className="absolute -right-10 top-1/3 w-[160px] h-[160px] rounded-full bg-brand-border-dark/40 tz-float-slower" />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center px-4 py-6 lg:py-8 short:py-3">
          <div className="w-full max-w-md lg:max-w-2xl tz-fade-up" style={{ animationDelay: "0.05s" }}>
            <div className="text-center mb-6 short:mb-4 lg:hidden">
              <AptaLogo variant="dark" className="text-4xl" />
            </div>
            <div className="mb-5 short:mb-3 hidden lg:block">
              <h1 className="font-display font-extrabold text-2xl short:text-xl uppercase tracking-[-.01em] text-tz-black">
                Bienvenido de vuelta
              </h1>
              <p className="text-sm text-muted mt-1">Accede a tu cuenta de Training Zone.</p>
            </div>

            <div className="bg-white border border-tz-linen rounded-card shadow-pop tz-card-sheen p-6 lg:p-8 short:lg:p-5">
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>

            <p className="text-center text-faint text-xs short:text-[11px] mt-4 short:mt-3">
              El inicio de sesión con Microsoft (Entra ID) está integrado en el
              código y listo para activarse en cuanto exista un App Registration
              real en el tenant de Azure del cliente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import RequestResetForm from "./request-reset-form";

export default function RecuperarClavePage() {
  return (
    <div className="min-h-screen bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
            Recuperar acceso
          </h1>
          <p className="text-sm text-muted mt-2">
            Escribe tu email y te enviaremos un enlace para elegir una contraseña nueva.
          </p>
        </div>
        <RequestResetForm />
        <Link href="/login" className="block text-xs text-muted underline">
          ← Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}

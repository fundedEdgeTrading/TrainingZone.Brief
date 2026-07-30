import Link from "next/link";
import ResetPasswordForm from "./reset-password-form";

// El token expira: la página no puede quedar cacheada con la primera respuesta.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
            Nueva contraseña
          </h1>
          <p className="text-sm text-muted mt-2">Elige una contraseña para volver a entrar.</p>
        </div>
        <ResetPasswordForm token={token} />
        <Link href="/login" className="block text-xs text-muted underline">
          ← Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}

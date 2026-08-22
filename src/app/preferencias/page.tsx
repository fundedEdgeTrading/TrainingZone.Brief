import Link from "next/link";
import RequestLinkForm from "./request-link-form";

export const metadata = {
  title: "Preferencias de correo",
  description: "Elige qué correos quieres recibir de tu centro.",
};

/**
 * Entrada sin token: el pie de los correos enlaza a `/preferencias/<token>`,
 * pero un enlace de hace un año puede haber caducado. Aquí se pide uno nuevo.
 */
export default function EmailPreferencesRequestPage() {
  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
            Preferencias de correo
          </h1>
          <p className="text-sm text-muted mt-2">
            Escribe tu email y te enviamos un enlace para elegir qué correos quieres recibir —o para darte de baja de
            todos.
          </p>
        </div>
        <RequestLinkForm />
        <p className="text-xs text-brand-muted">
          Los correos de tu cuenta y de tu cuota no se pueden desactivar: son parte del servicio.{" "}
          <Link href="/privacidad" className="underline">
            Cómo tratamos tus datos
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

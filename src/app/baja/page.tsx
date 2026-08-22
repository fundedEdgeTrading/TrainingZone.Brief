import Link from "next/link";
import RequestLinkForm from "@/app/preferencias/request-link-form";

export const metadata = {
  title: "Darse de baja",
  description: "Deja de recibir los correos prescindibles de tu centro.",
};

/**
 * Entrada sin token al circuito de baja. No se puede dar de baja a nadie solo
 * con un email escrito en un formulario público —cualquiera podría dar de baja
 * a otro—, así que se manda el enlace firmado al buzón de esa dirección.
 */
export default function UnsubscribeRequestPage() {
  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
            Darte de baja
          </h1>
          <p className="text-sm text-muted mt-2">
            La forma más rápida es el enlace <b>Darme de baja</b> del pie de cualquiera de nuestros correos. Si no lo
            tienes a mano, escribe tu email y te enviamos uno nuevo.
          </p>
        </div>
        <RequestLinkForm ctaLabel="Enviarme el enlace de baja" />
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

import type { Metadata } from "next";
import AptaLogo from "@/components/apta-logo";

export const metadata: Metadata = { title: "Gracias · Training Zone" };

/**
 * Confirmación pública genérica tras el checkout anónimo de `/hazte-socio` (D1). Igual que
 * `/activar` para el alta de organizaciones (Plano 1, platform-billing.ts): el checkout es
 * anónimo y puede ser de cualquier organización/centro, así que no hay slug al que volver —
 * el alta real la hace el webhook de forma asíncrona, este mensaje solo cierra el bucle visual.
 */
export default async function HazteSocioGraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const cancelled = checkout === "cancelled";

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md bg-white border border-brand-border rounded-card shadow-pop p-6 sm:p-9 text-center">
        <AptaLogo variant="dark" className="text-2xl mb-4 inline-block" />
        {cancelled ? (
          <>
            <h1 className="font-display font-extrabold text-xl uppercase text-brand-text">Pago cancelado</h1>
            <p className="text-sm text-brand-text-2 mt-2">
              No se ha realizado ningún cargo. Puedes volver atrás e intentarlo de nuevo cuando quieras.
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-tz-black text-tz-bone flex items-center justify-center mx-auto text-2xl">✓</div>
            <h1 className="font-display font-extrabold text-xl uppercase text-brand-text mt-4">¡Pago recibido!</h1>
            <p className="text-sm text-brand-text-2 mt-2">
              En unos minutos recibirás un email con el acceso a tu portal de socio, donde podrás crear tu contraseña y
              empezar a reservar.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { verifyEmailPreferencesToken } from "@/lib/email-verification";
import { getMemberEmailPreferences } from "@/lib/email-preferences-queries";
import PreferencesForm from "./preferences-form";

// El token viaja en la URL y las preferencias cambian con cada guardado: esta
// página no puede servirse cacheada (mismo motivo que /gestionar-suscripcion).
export const dynamic = "force-dynamic";

function InfoScreen({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px] bg-white border border-tz-linen rounded-card shadow-pop p-8 text-center">
        <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">{title}</h1>
        <p className="text-sm text-muted mt-3">{body}</p>
        {cta && (
          <Link
            href={cta.href}
            className="inline-block mt-6 font-semibold bg-tz-black text-tz-bone rounded-control px-6 py-3 text-sm no-underline"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Preferencias de correo del socio, sin login: el enlace del pie de cada email
 * lleva su token firmado (ver `email-verification.ts`). Sin sesión a propósito
 * — exigir contraseña para dejar de recibir correo es exactamente lo que la
 * normativa llama "no facilitar el medio".
 */
export default async function EmailPreferencesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyEmailPreferencesToken(token);

  if (!result.ok) {
    return (
      <InfoScreen
        title={result.error === "expired" ? "Enlace caducado" : "Enlace no válido"}
        body="Este enlace ya no sirve. Pide uno nuevo con tu email y te lo enviamos al momento."
        cta={{ href: "/preferencias", label: "Pedir un enlace nuevo" }}
      />
    );
  }

  const view = await getMemberEmailPreferences(result.memberId);
  if (!view) {
    return <InfoScreen title="Enlace no válido" body="No hemos encontrado la ficha asociada a este enlace." />;
  }

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[560px] bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-muted">{view.brandName}</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black mt-1">
            Preferencias de correo
          </h1>
          <p className="text-sm text-muted mt-2">
            Hola, {view.firstName}. Elige qué correos quieres recibir en <b>{view.email}</b>.
          </p>
        </div>

        <PreferencesForm token={token} preferences={view.preferences} />

        <p className="text-xs text-brand-muted border-t border-tz-linen pt-4">
          Los correos de tu cuenta y de tu cuota —alta de acceso, contraseña, enlace de pago y avisos de cobro— no se
          pueden desactivar: son parte del servicio que tienes contratado con {view.centerName}.{" "}
          <Link href="/privacidad" className="underline">
            Cómo tratamos tus datos
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

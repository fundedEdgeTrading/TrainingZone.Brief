import Link from "next/link";
import { verifyEmailPreferencesToken } from "@/lib/email-verification";
import { getMemberEmailPreferences } from "@/lib/email-preferences-queries";
import UnsubscribeForm from "./unsubscribe-form";

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
 * Baja desde el enlace "Darme de baja" del pie. Se confirma con un clic en vez
 * de darla de baja al abrir la página: los antivirus y los escáneres de enlaces
 * de algunos clientes de correo visitan todas las URLs de un email, y una baja
 * ejecutada por un GET automático es una baja que el socio no pidió.
 *
 * La baja de un clic de verdad (la del botón de Gmail) va por POST a
 * `/api/email/baja/<token>`, que sí es una petición intencionada del cliente.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = verifyEmailPreferencesToken(token);

  if (!result.ok) {
    return (
      <InfoScreen
        title={result.error === "expired" ? "Enlace caducado" : "Enlace no válido"}
        body="Este enlace ya no sirve. Pide uno nuevo con tu email y te lo enviamos al momento."
        cta={{ href: "/baja", label: "Pedir un enlace nuevo" }}
      />
    );
  }

  const view = await getMemberEmailPreferences(result.memberId);
  if (!view) {
    return <InfoScreen title="Enlace no válido" body="No hemos encontrado la ficha asociada a este enlace." />;
  }

  if (view.preferences.emailOptOutAt) {
    return (
      <InfoScreen
        title="Ya estabas de baja"
        body={`No te enviamos ningún correo prescindible a ${view.email}. Los de tu cuenta y tu cuota siguen llegándote: son parte del servicio.`}
        cta={{ href: `/preferencias/${token}`, label: "Elegir qué recibir" }}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-tz-bone flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px] bg-white border border-tz-linen rounded-card shadow-pop p-8 space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-muted">{view.brandName}</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black mt-1">
            Darte de baja
          </h1>
          <p className="text-sm text-muted mt-2">
            Hola, {view.firstName}. Dejaremos de enviar a <b>{view.email}</b> los avisos de plazas, los recordatorios de
            valoración, la felicitación de cumpleaños y las novedades del centro.
          </p>
        </div>

        <UnsubscribeForm token={token} />

        <p className="text-xs text-brand-muted border-t border-tz-linen pt-4">
          ¿Solo te sobran algunos?{" "}
          <Link href={`/preferencias/${token}`} className="underline">
            Elige uno a uno
          </Link>
          . Los correos de tu cuenta y de tu cuota seguirán llegándote: son parte del servicio que tienes contratado con{" "}
          {view.centerName}.
        </p>
      </div>
    </div>
  );
}

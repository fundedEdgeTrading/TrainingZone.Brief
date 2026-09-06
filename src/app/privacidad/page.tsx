import Link from "next/link";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import { DECLARED_DATA_REGION, resolveDataRegion, THIRD_PARTY_PROCESSORS } from "@/lib/data-region";

export const metadata = {
  title: "Privacidad",
  description: "Cómo tratamos tus datos personales y de salud.",
};

/**
 * Destino del enlace "Privacidad" del pie de todos los correos. El texto es el
 * mismo que firma el socio en el onboarding (`lib/consent.ts`), en un único
 * sitio: si se publicaran dos redacciones distintas, la que vale sería la
 * firmada y esta página estaría mintiendo.
 */
export default function PrivacyPage() {
  const region = resolveDataRegion(DECLARED_DATA_REGION);

  return (
    <div className="min-h-dvh bg-tz-bone px-4 py-12">
      <div className="mx-auto w-full max-w-[680px] bg-white border border-tz-linen rounded-card shadow-pop p-8 sm:p-10 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-muted">Training Zone</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black mt-1">
            Privacidad y datos
          </h1>
          <p className="text-sm text-muted mt-2">
            Versión del consentimiento vigente: <b>{CONSENT_VERSION}</b>. Es el mismo texto que firmas al activar tu
            cuenta.
          </p>
        </div>

        <div className="space-y-4">
          {CONSENT_TEXT.map((paragraph, i) => (
            <p key={i} className="text-sm leading-relaxed text-brand-text-2">
              {paragraph}
            </p>
          ))}
        </div>

        <section className="border-t border-tz-linen pt-6 space-y-3">
          <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black">
            Correos que te enviamos
          </h2>
          <p className="text-sm leading-relaxed text-brand-text-2">
            Te escribimos por dos motivos distintos. Los <b>correos de servicio</b> —alta de tu acceso, contraseña,
            enlace para gestionar tu cuota y avisos de cobro— son la ejecución del contrato que tienes con tu centro y
            no se pueden desactivar: sin ellos no podrías entrar ni pagar. El resto —avisos de plazas liberadas,
            recordatorios de valoración, felicitación de cumpleaños y novedades del centro— son{" "}
            <b>prescindibles</b> y los paras cuando quieras.
          </p>
          <p className="text-sm leading-relaxed text-brand-text-2">
            Cada correo prescindible lleva en el pie un enlace de <b>Preferencias de correo</b> y otro de{" "}
            <b>Darme de baja</b>, y tu cliente de correo puede ofrecerte además su propio botón de cancelar
            suscripción. Todos hacen lo mismo y son gratuitos.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/preferencias"
              className="font-semibold bg-tz-black text-tz-bone rounded-control px-5 py-2.5 text-sm no-underline"
            >
              Gestionar mis preferencias
            </Link>
            <Link
              href="/baja"
              className="font-semibold bg-white border border-brand-border text-brand-text rounded-control px-5 py-2.5 text-sm no-underline"
            >
              Darme de baja
            </Link>
          </div>
        </section>

        {/* E10-07 · la región y la tabla de proveedores salen de
            `lib/data-region.ts`, que es lo mismo que verifica el arranque.
            Cambiar la región del despliegue sin tocar ese fichero para el
            servidor; tocarlo cambia también este texto. */}
        <section className="border-t border-tz-linen pt-6 space-y-3">
          <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black">
            Dónde están tus datos
          </h2>
          <p className="text-sm leading-relaxed text-brand-text-2">
            La base de datos que guarda tu ficha, tus reservas y tus datos de salud está alojada en{" "}
            <b>
              {region ? `${region.label} (${region.country})` : DECLARED_DATA_REGION}
            </b>
            , dentro de la Unión Europea. El servidor comprueba esta región cada vez que arranca y se detiene si no
            coincide, para que un cambio de infraestructura no pueda mover tus datos fuera de la UE en silencio.
          </p>
          <p className="text-sm leading-relaxed text-brand-text-2">
            Para prestarte el servicio trabajamos con los siguientes proveedores, que tratan datos por cuenta de tu
            centro y bajo contrato (art. 28 RGPD):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] text-left border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-brand-muted">
                  <th className="py-2 pr-3 font-bold">Proveedor</th>
                  <th className="py-2 pr-3 font-bold">Para qué</th>
                  <th className="py-2 pr-3 font-bold">Dónde</th>
                  <th className="py-2 font-bold">Garantía de la transferencia</th>
                </tr>
              </thead>
              <tbody className="text-brand-text-2">
                {THIRD_PARTY_PROCESSORS.map((p) => (
                  <tr key={p.name} className="border-t border-tz-linen align-top">
                    <td className="py-2 pr-3 font-semibold text-tz-black">{p.name}</td>
                    <td className="py-2 pr-3">{p.purpose}</td>
                    <td className="py-2 pr-3">{p.location}</td>
                    <td className="py-2">{p.transferMechanism}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-tz-linen pt-6 space-y-3">
          <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black">
            Tus derechos
          </h2>
          <p className="text-sm leading-relaxed text-brand-text-2">
            Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad
            escribiendo a{" "}
            <a href="mailto:info@trainingzone.es" className="underline">
              info@trainingzone.es
            </a>
            . Si tienes cuenta en el portal, tu ficha, tus valoraciones y tus datos de salud los tienes también dentro,
            y puedes descargarlos desde tu perfil.
          </p>
        </section>
      </div>
    </div>
  );
}

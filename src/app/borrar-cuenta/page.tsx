import Link from "next/link";

import { ACCOUNT_DELETION_PORTAL_PATH } from "@/lib/account-deletion";

export const metadata = {
  title: "Borrar tu cuenta",
  description:
    "Cómo pedir el borrado de tu cuenta de Training Zone: qué se borra, qué se conserva por obligación legal y en cuánto tiempo.",
};

/**
 * E5-15 · URL web pública del borrado de cuenta.
 *
 * Existe porque la política de Google Play exige una URL **accesible desde la
 * ficha de la tienda** que explique cómo pedir el borrado —sin instalar la app,
 * sin iniciar sesión y sin escribir un email—, y porque App Store Review 5.1.1(v)
 * exige la ruta in-app equivalente. La ficha de tienda la enlaza desde `/app`
 * (E9-16); la ruta vive aquí, estable, para que ese enlace no se rompa.
 *
 * Pública de verdad: entra en `PUBLIC_PATHS`, así que el proxy no la rebota a
 * `/login`. Una URL de borrado que exige sesión no cumple lo que la tienda pide.
 *
 * Lo que NO hay aquí es un formulario sin sesión: la identidad no se puede
 * verificar por un campo de email, y aceptar peticiones anónimas convertiría
 * esta página en un modo de pedir el borrado de la cuenta de otro. El art. 12.6
 * RGPD contempla justamente pedir la información necesaria para confirmar la
 * identidad.
 */
export default function PublicAccountDeletionPage() {
  return (
    <div className="min-h-dvh bg-tz-bone px-4 py-12">
      <div className="mx-auto w-full max-w-[680px] bg-white border border-tz-linen rounded-card shadow-pop p-8 sm:p-10 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-muted">Training Zone</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black mt-1">
            Borrar tu cuenta
          </h1>
          <p className="text-sm text-muted mt-2">
            Puedes pedirlo desde la app o desde la web. Esto es lo que ocurre, y cuánto tarda.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="font-display font-extrabold text-sm uppercase tracking-[.06em] text-tz-black">
            Cómo se pide
          </h2>
          <ol className="text-sm text-brand-text-2 leading-relaxed list-decimal pl-5 space-y-2">
            <li>
              <strong>Desde la app:</strong> abre <em>Mi cuenta</em> y entra en <em>Borrar mi cuenta</em>.
            </li>
            <li>
              <strong>Desde la web:</strong> entra en tu portal y ve a{" "}
              <Link href={ACCOUNT_DELETION_PORTAL_PATH} className="underline font-semibold">
                Perfil → Borrar mi cuenta
              </Link>
              . No necesitas tener la app instalada.
            </li>
            <li>
              En las dos, antes de confirmar verás el detalle de qué se borra y qué se conserva, y tendrás que
              confirmar con tu contraseña.
            </li>
          </ol>
          <p className="text-[13px] text-brand-muted leading-relaxed">
            ¿No recuerdas la contraseña? Puedes fijar una nueva desde{" "}
            <Link href="/recuperar-clave" className="underline">
              ¿Has olvidado tu contraseña?
            </Link>
            . Si tampoco puedes acceder al correo de tu cuenta, pídelo en la recepción de tu centro: te pedirán
            acreditar tu identidad (art. 12.6 RGPD) y tramitarán la solicitud igual.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-extrabold text-sm uppercase tracking-[.06em] text-tz-black">
            Cuánto tarda
          </h2>
          <p className="text-sm text-brand-text-2 leading-relaxed">
            Un mes como máximo desde que la pides (art. 12.3 RGPD). Recibes un acuse por correo al pedirla, con la
            fecha límite, y otro cuando se resuelve. Mientras tanto puedes consultar en qué estado está desde tu
            portal o desde la app.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-extrabold text-sm uppercase tracking-[.06em] text-tz-black">
            Qué se borra
          </h2>
          <p className="text-sm text-brand-text-2 leading-relaxed">
            Tus datos de contacto, tu acceso al portal, tu historial de reservas y de asistencia, tus fotos y medidas
            de evolución, las anotaciones internas sobre ti, tus objetivos, tus valoraciones y tus mesociclos. Tus
            datos de salud dejan de estar ligados a tu persona y se borran al cumplirse el plazo de conservación de tu
            centro.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display font-extrabold text-sm uppercase tracking-[.06em] text-tz-black">
            Qué NO se borra, y por qué
          </h2>
          <p className="text-sm text-brand-text-2 leading-relaxed">
            <strong>Los cobros que ya se te emitieron se disocian, no se borran.</strong> Se conservan el número de
            recibo, el importe, la fecha y el método de pago, y se les retira el vínculo contigo: dejan de
            identificarte y siguen contando en la contabilidad del periodo. Tu centro está obligado a conservarlos por
            el art. 30 del Código de Comercio y el art. 66 de la Ley General Tributaria; destruirlos dentro de ese
            plazo sería una infracción del art. 200 LGT.
          </p>
          <p className="text-sm text-brand-text-2 leading-relaxed">
            También se conserva el registro de auditoría, que no se reescribe: se le añade el apunte de tu solicitud y
            el de su resolución, sin tu nombre. Es la prueba de que tu derecho se atendió y cuándo.
          </p>
          <p className="text-[13px] text-brand-muted leading-relaxed">
            En tu portal verás los plazos exactos que aplica tu centro, bloque a bloque, antes de confirmar.
          </p>
        </section>

        <section className="space-y-3 border-t border-tz-linen pt-6">
          <p className="text-[13px] text-brand-muted leading-relaxed">
            Antes de borrar tu cuenta puedes descargar una copia de tus datos desde tu portal (art. 15 y art. 20
            RGPD). Después ya no será posible.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={ACCOUNT_DELETION_PORTAL_PATH}
              className="inline-flex items-center gap-2 bg-brand-ink text-tz-bone rounded-[11px] px-5 py-3 font-display font-bold text-sm"
            >
              Ir a mi portal →
            </Link>
            <Link
              href="/privacidad"
              className="inline-flex items-center gap-2 bg-white text-brand-text border border-brand-border rounded-[11px] px-5 py-3 font-display font-bold text-sm hover:bg-tz-bone transition-colors duration-150"
            >
              Política de privacidad
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

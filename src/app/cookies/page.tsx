import Link from "next/link";

export const metadata = {
  title: "Cookies",
  description: "Inventario de cookies: solo las técnicas, y por qué no hace falta un banner.",
};

const COOKIES = [
  {
    name: "authjs.session-token",
    purpose: "Mantiene tu sesión iniciada (Auth.js/NextAuth). Sin ella tendrías que volver a entrar en cada página.",
    duration: "Hasta 30 días, o hasta que cierres sesión.",
  },
  {
    name: "tz",
    purpose: "Tu zona horaria, detectada por el navegador — para que las horas de tus clases y tus cuentas atrás sean las tuyas, no las del servidor.",
    duration: "1 año.",
  },
];

/**
 * E10-22/CN-15: acreditar por escrito que hoy no hace falta un banner de
 * cookies — verificado: cero analítica, cero GTM, cero píxeles. Solo las dos
 * técnicas de abajo, ninguna de las cuales exige consentimiento (Art. 22
 * LSSI / considerando 25 de la Directiva ePrivacy: exentas las
 * estrictamente necesarias para el servicio que el usuario pide).
 */
export default function CookiesPage() {
  return (
    <div className="min-h-dvh bg-tz-bone px-4 py-12">
      <div className="mx-auto w-full max-w-[680px] bg-white border border-tz-linen rounded-card shadow-pop p-8 sm:p-10 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-muted">Training Zone</p>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black mt-1">Cookies</h1>
          <p className="text-sm text-muted mt-2">Las que usamos hoy, para qué sirve cada una y cuánto dura.</p>
        </div>

        <section className="space-y-3">
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-tz-linen">
                  <th className="py-2 pr-3 font-display font-extrabold uppercase text-[11px] tracking-[.08em] text-brand-muted">
                    Cookie
                  </th>
                  <th className="py-2 pr-3 font-display font-extrabold uppercase text-[11px] tracking-[.08em] text-brand-muted">
                    Para qué
                  </th>
                  <th className="py-2 font-display font-extrabold uppercase text-[11px] tracking-[.08em] text-brand-muted">
                    Duración
                  </th>
                </tr>
              </thead>
              <tbody>
                {COOKIES.map((c) => (
                  <tr key={c.name} className="border-b border-tz-linen last:border-0 align-top">
                    <td className="py-3 pr-3 font-mono text-[13px] text-tz-black whitespace-nowrap">{c.name}</td>
                    <td className="py-3 pr-3 text-brand-text-2 leading-relaxed">{c.purpose}</td>
                    <td className="py-3 text-brand-text-2 whitespace-nowrap">{c.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-tz-linen pt-6 space-y-3">
          <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-tz-black">
            Por qué no hay un banner de cookies
          </h2>
          <p className="text-sm leading-relaxed text-brand-text-2">
            Un banner de consentimiento hace falta para cookies de analítica, publicidad o cualquier cosa que perfile
            tu navegación. Las dos de arriba son <b>estrictamente técnicas</b>: existen para que la aplicación
            funcione (mantener tu sesión, mostrarte la hora que toca), no para medirte ni seguirte. Hoy no usamos
            analítica, ni Google Tag Manager, ni píxeles de ningún proveedor — así que no hay nada de lo que pedirte
            permiso.
          </p>
          <p className="text-sm leading-relaxed text-brand-text-2">
            Si eso cambia algún día, esta página se actualiza en el mismo cambio que instale lo nuevo, y aparecerá el
            banner correspondiente.
          </p>
        </section>

        <section className="border-t border-tz-linen pt-6">
          <p className="text-sm leading-relaxed text-brand-text-2">
            Más sobre cómo tratamos tus datos en{" "}
            <Link href="/privacidad" className="underline font-semibold">
              Privacidad y datos
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

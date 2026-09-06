import Link from "next/link";

import { buttonClass } from "@/components/ui/button";

/**
 * E8-01 · 404 propio, con marca y salida.
 *
 * Es el que recogen los `notFound()` que ya lanzaban las rutas públicas
 * (`lead-form`, `hazte-socio`, `demo-checkout`) y las de la aplicación cuando el
 * recurso no existe o queda fuera del ámbito de centro — que es el caso más
 * frecuente: un enlace a la ficha de un socio de otro centro no es "no existe",
 * es "aquí no", y por eso el texto no afirma que el recurso no exista.
 *
 * Sin `reset`: reintentar un 404 no lleva a ninguna parte. Server Component a
 * propósito, para que el 404 no arrastre JavaScript.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-brand-border bg-brand-card p-8 text-center shadow-pop">
        <p className="font-display text-[40px] font-extrabold leading-none tracking-[-.02em] text-brand-border">404</p>
        <h1 className="mt-3 font-display text-xl font-extrabold uppercase tracking-[-.01em] text-brand-text">
          Esta página no está aquí
        </h1>
        <p className="mt-2.5 text-sm text-brand-muted">
          El enlace puede haber caducado, o el contenido pertenecer a otro centro. Vuelve al inicio y sigue desde ahí.
        </p>
        <div className="mt-6">
          <Link href="/" className={buttonClass()}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

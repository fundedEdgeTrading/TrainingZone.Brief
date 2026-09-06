"use client";

import Link from "next/link";

import { useHomeRoute } from "@/app/(app)/home-route";
import { buttonClass } from "@/components/ui/button";

/**
 * E8-01 · 404 dentro de la aplicación.
 *
 * El `not-found.tsx` raíz cubre las rutas públicas, pero siete de los doce
 * `notFound()` del proyecto están en `(app)`: agenda, leads, brief, feedback,
 * ficha del socio, mesociclos y valoraciones. Con este, esos siete conservan
 * sidebar y cabecera y la salida es la del rol, no un "/" para todos.
 */
export default function NotFound() {
  const homeHref = useHomeRoute();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-brand-border bg-brand-card p-8 text-center shadow-pop">
        <p className="font-display text-[40px] font-extrabold leading-none tracking-[-.02em] text-brand-border">404</p>
        <h1 className="mt-3 font-display text-xl font-extrabold uppercase tracking-[-.01em] text-brand-text">
          Aquí no hay nada
        </h1>
        <p className="mt-2.5 text-sm text-brand-muted">
          Puede que el registro ya no exista, o que pertenezca a un centro que no tienes asignado.
        </p>
        <div className="mt-6">
          <Link href={homeHref} className={buttonClass({ variant: "secondary" })}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

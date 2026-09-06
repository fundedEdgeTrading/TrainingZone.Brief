"use client";

import { CriticalError } from "@/components/ui/critical-error";

/**
 * E8-01 · Último recinto: solo entra si el fallo ocurre en el propio layout raíz,
 * donde ya no hay ni `<html>` ni proveedores, así que este fichero los pinta.
 *
 * La salida es "/": `src/app/page.tsx` redirige a `defaultRouteForRole`, de modo
 * que cada rol acaba en su sitio aunque aquí no haya sesión que consultar.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-brand-bg text-brand-text">
        <CriticalError title="Algo ha fallado" error={error} reset={reset} homeHref="/" />
      </body>
    </html>
  );
}

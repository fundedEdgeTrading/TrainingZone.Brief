"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { messageForError } from "@/lib/error-copy";

/**
 * Estado crítico de pantalla completa: marca, explicación y **dos salidas**
 * (E8-01).
 *
 * Antes no había ni un `error.tsx` en toda la aplicación, así que cualquier
 * excepción en un Server Component dejaba la pantalla genérica de Next: sin
 * marca, sin explicación y sin salida. Con recepción atendiendo a alguien
 * delante, eso es quedarse mirando "Application error".
 *
 * Se usa desde los `error.tsx` de segmento, que sí se pintan **dentro** del
 * layout de `(app)`, de modo que el sidebar y la cabecera siguen ahí.
 */
export function CriticalError({
  title = "No hemos podido cargar esta pantalla",
  error,
  reset,
  homeHref,
  homeLabel = "Volver al inicio",
}: {
  title?: string;
  error?: (Error & { digest?: string }) | null;
  /** `reset` del error boundary de Next: reintenta el render del segmento. */
  reset?: () => void;
  homeHref: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    // Sin esto el fallo se queda solo en el HTML: en producción el mensaje real
    // no viaja al cliente, pero el digest sí, y es lo que permite cruzarlo con
    // la traza del servidor cuando alguien lo reporta por teléfono.
    if (error) console.error("[error boundary]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-brand-border bg-brand-card p-8 text-center shadow-pop">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-critical-bg">
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-critical)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8v5" />
            <path d="M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>

        <h1 className="font-display text-xl font-extrabold uppercase tracking-[-.01em] text-brand-text">{title}</h1>
        <p className="mt-2.5 text-sm text-brand-muted">{messageForError(error)}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {reset && (
            <Button type="button" onClick={reset}>
              Reintentar
            </Button>
          )}
          <Link href={homeHref} className={buttonClass({ variant: "secondary" })}>
            {homeLabel}
          </Link>
        </div>

        {error?.digest && (
          // Para soporte: es lo único que identifica este fallo concreto en los
          // registros del servidor.
          <p className="mt-5 text-[11px] tracking-[0.04em] text-faint">
            Código del incidente: <span className="tz-nums font-semibold">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Nadie se suscribe: el origen no cambia mientras la pestaña vive. */
const NO_SUBSCRIBE = () => () => {};

/**
 * E9-15 · Una URL pública con su botón de copiar.
 *
 * El origen se resuelve en el cliente (`window.location.origin`) a propósito: es
 * el dominio por el que la persona ha entrado, que es el que va a pegar en su
 * web y en su Instagram. Pintarlo desde el servidor obligaría a que
 * `NEXT_PUBLIC_SITE_URL` estuviese bien puesto en cada entorno para que el
 * enlace no fuese a otro sitio. Hasta que hidrata se enseña la ruta, que ya es
 * legible.
 */
export function CopyLink({ label, path }: { label: string; path: string }) {
  // `useSyncExternalStore` y no un efecto: el origen es estado EXTERNO a React,
  // y con la instantánea de servidor vacía el HTML del servidor y el primer
  // render del cliente coinciden sin provocar un repintado en cascada.
  const origin = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => window.location.origin,
    () => ""
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const url = origin ? `${origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles (o sin HTTPS): el enlace sigue ahí,
      // seleccionable. No se convierte en un error que no lleva a nada.
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[.06em] text-brand-muted">{label}</p>
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[12px] text-brand-text-2 underline decoration-brand-border underline-offset-2"
        >
          {url}
        </a>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-control border border-brand-border bg-brand-card px-2.5 py-1.5 text-[11px] font-semibold text-brand-text-2 transition-colors duration-150 hover:bg-tz-sand"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

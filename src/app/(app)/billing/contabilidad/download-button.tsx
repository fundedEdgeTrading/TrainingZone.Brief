"use client";

import { useState, useTransition } from "react";

export type DownloadPayload = { ok: true; csv: string; fileName: string } | { ok: false; error: string };

/**
 * Botón de descarga de un fichero que ARMA EL SERVIDOR.
 *
 * El patrón de `export-ranking-button` (Blob + `link.download`) para la parte
 * del navegador, pero con el contenido traído de una acción de servidor: el
 * extracto contable lleva ámbito de centro y deja `AuditLog`, así que no puede
 * componerse aquí con lo que la pantalla tenga a mano.
 *
 * El botón enseña el motivo cuando la acción se niega —plan sin exportaciones,
 * ámbito vacío—, en vez de no hacer nada.
 */
export function DownloadButton({
  label,
  pendingLabel,
  request,
  variant = "primary",
  disabled = false,
  disabledReason,
}: {
  label: string;
  pendingLabel: string;
  request: () => Promise<DownloadPayload>;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const click = () => {
    setError(null);
    startTransition(async () => {
      const result = await request();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const base =
    "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-opacity duration-150 hover:opacity-90 disabled:opacity-50";
  const skin =
    variant === "primary"
      ? "bg-brand-ink text-tz-bone"
      : "border border-brand-border bg-brand-card text-brand-text";

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={click} disabled={pending || disabled} className={`${base} ${skin}`}>
        {pending ? pendingLabel : label}
      </button>
      {(error || (disabled && disabledReason)) && (
        <p className="text-[11px] text-brand-muted max-w-xs">{error ?? disabledReason}</p>
      )}
    </div>
  );
}

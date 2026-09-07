"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { SecondaryProfileField } from "@/lib/member-first-session";

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function dismissKey(memberId: string, fields: SecondaryProfileField[]) {
  return `tz-secondary-profile-dismissed-${memberId}-${fields.join(",")}`;
}

/**
 * E5-08: "el resto se pide después" — dirección, ciudad, provincia y CP ya no
 * bloquean el muro de alta, pero siguen haciendo falta (el CP alimenta el
 * mapa de socios por barrio). Aviso NO bloqueante: se puede cerrar y seguir
 * usando el portal con normalidad.
 */
export function SecondaryProfileBanner({
  memberId,
  missing,
  labels,
}: {
  memberId: string;
  missing: SecondaryProfileField[];
  labels: string[];
}) {
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);

  if (!mounted || missing.length === 0 || dismissed) return null;
  if (typeof window !== "undefined" && window.localStorage.getItem(dismissKey(memberId, missing)) === "1") return null;

  return (
    <div className="bg-tz-sand border border-brand-border rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap tz-fade-up">
      <p className="text-[13px] text-brand-text-2">
        Nos falta tu <b className="text-brand-text">{labels.join(", ").toLowerCase()}</b>. No bloquea nada, pero
        complétalo cuando puedas.
      </p>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/portal/perfil"
          className="text-xs font-extrabold uppercase text-brand-text underline underline-offset-2 hover:text-brand-ink"
        >
          Completar en mi perfil →
        </Link>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(dismissKey(memberId, missing), "1");
            setDismissed(true);
          }}
          className="text-brand-muted hover:text-brand-text text-lg leading-none"
          aria-label="Cerrar aviso"
        >
          ×
        </button>
      </div>
    </div>
  );
}

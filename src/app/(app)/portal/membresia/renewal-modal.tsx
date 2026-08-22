"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import PurchasePlanButton from "./purchase-plan-button";

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function dismissKey(subscriptionId: string) {
  return `tz-renewal-dismissed-${subscriptionId}`;
}

export function RenewalModal({
  subscriptionId,
  sessionsRemaining,
  sessionsIncluded,
  trainerFirstName,
  renewPlan,
}: {
  subscriptionId: string;
  sessionsRemaining: number;
  sessionsIncluded: number;
  trainerFirstName: string | null;
  renewPlan: { id: string; name: string; priceLabel: string } | null;
}) {
  const mounted = useMounted();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forcedOpen = searchParams.get("renovar") === "1";
  // Se silencia por combinación de suscripción + nº de sesiones restantes (se
  // usa localStorage, no cookie: es una preferencia de UI sin efecto en
  // servidor). Al gastar otra sesión el contador cambia y vuelve a aparecer.
  // Inicializador perezoso en vez de leerlo en un efecto: `subscriptionId`/
  // `sessionsRemaining` no cambian sin una navegación completa de la página.
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(dismissKey(subscriptionId)) === String(sessionsRemaining);
  });

  if (!mounted) return null;

  const shouldShowByThreshold = sessionsRemaining <= 2 && !dismissed;
  const open = forcedOpen || shouldShowByThreshold;
  if (!open) return null;

  function close() {
    window.localStorage.setItem(dismissKey(subscriptionId), String(sessionsRemaining));
    setDismissed(true);
    if (forcedOpen) router.replace("/portal/membresia");
  }

  return createPortal(
    <div
      onClick={close}
      className="fixed inset-0 z-[80] flex items-center justify-center p-10 bg-[rgba(29,29,28,.55)]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Renovación de bono"
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-full bg-white rounded-[20px] overflow-hidden shadow-pop"
        style={{ animation: "tzSelectPop .22s cubic-bezier(.2,.8,.2,1) both" }}
      >
        <div className="bg-brand-ink px-7 py-[26px]">
          <div className="inline-flex items-center gap-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-apta-gold">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
            Te quedan pocas sesiones
          </div>
          <div className="font-display font-extrabold text-2xl leading-[1.1] uppercase text-white mt-3">
            Quedan {sessionsRemaining} de tus {sessionsIncluded} sesiones
          </div>
          <p className="text-[13.5px] leading-[1.55] text-brand-muted-2 mt-2.5">
            Renueva ahora{trainerFirstName ? ` y mantienes tus horarios con ${trainerFirstName}` : ""} sin interrupciones.
          </p>
        </div>

        <div className="px-7 pt-[22px] pb-6 flex flex-col gap-3.5">
          {renewPlan && (
            <div className="flex items-center justify-between gap-3 border border-brand-border rounded-xl px-4 py-3.5">
              <div>
                <div className="text-[13.5px] font-bold text-brand-text">{renewPlan.name}</div>
                <div className="text-xs text-brand-muted mt-0.5">Se activa al agotar el actual</div>
              </div>
              <span className="font-display font-extrabold text-lg text-brand-text">{renewPlan.priceLabel}</span>
            </div>
          )}
          <div className="flex gap-2.5">
            {renewPlan ? (
              <PurchasePlanButton
                planId={renewPlan.id}
                className="flex-1 text-center bg-brand-ink text-tz-bone rounded-[10px] px-4 py-[13px] font-display font-extrabold text-[13px] uppercase tracking-[.03em] transition-colors duration-150 hover:bg-brand-ink-soft disabled:opacity-60"
              >
                Renovar ahora
              </PurchasePlanButton>
            ) : (
              <span className="flex-1 text-center bg-brand-ink/40 text-tz-bone rounded-[10px] px-4 py-[13px] font-display font-extrabold text-[13px] uppercase tracking-[.03em]">
                Renovar ahora
              </span>
            )}
            <button
              onClick={close}
              className="border border-brand-border text-brand-text-2 rounded-[10px] px-[18px] py-[13px] font-display font-bold text-[13px] transition-colors duration-150 hover:bg-tz-bone"
            >
              Más tarde
            </button>
          </div>
          <p className="text-[11.5px] text-brand-muted-2 text-center">
            También puedes hablar con recepción desde el chat del portal.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

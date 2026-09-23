"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import PurchasePlanButton from "./purchase-plan-button";
import { advanceRenewalAction, getAdvanceRenewalPreview, type AdvancePreviewResult } from "./advance-actions";

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

// --- ADV-02 · Adelantar la renovación de la cuota recurrente ----------------

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function money(cents: number, currency: string) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: currency.toUpperCase() });
}

type OneOffPlan = { id: string; name: string; priceLabel: string };

/**
 * Con una cuota recurrente viva, "Renovar" ya no abre un checkout nuevo (que
 * crearía una SEGUNDA suscripción): adelanta el cobro de la que ya hay.
 *
 * Importe y fechas vienen del servidor, que se los pide a Stripe con los mismos
 * parámetros del adelanto: aquí solo se formatean, no se calcula ninguna.
 */
export function AdvanceRenewalButton({
  subscriptionId,
  oneOffPlans,
  className,
  children,
}: {
  subscriptionId: string;
  /** D5: con SEPA no se adelanta; se ofrece un bono puntual en su lugar. */
  oneOffPlans: OneOffPlan[];
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <AdvanceRenewalModal subscriptionId={subscriptionId} oneOffPlans={oneOffPlans} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function AdvanceRenewalModal({
  subscriptionId,
  oneOffPlans,
  onClose,
}: {
  subscriptionId: string;
  oneOffPlans: OneOffPlan[];
  onClose: () => void;
}) {
  const mounted = useMounted();
  const router = useRouter();
  const toast = useToast();
  const [preview, setPreview] = useState<AdvancePreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmError, setConfirmError] = useState<{ error: string; hostedInvoiceUrl: string | null } | null>(null);

  // Se pide al abrir, no al cargar la página: es una llamada a Stripe que solo
  // hace falta si el socio de verdad quiere adelantar.
  useEffect(() => {
    let cancelled = false;
    getAdvanceRenewalPreview(subscriptionId).then(
      (result) => {
        if (!cancelled) setPreview(result);
      },
      () => {
        if (!cancelled) setPreview({ ok: false, code: "STRIPE_ERROR", error: "No se ha podido consultar el importe. Inténtalo de nuevo." });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  if (!mounted) return null;

  function confirm() {
    setConfirmError(null);
    startTransition(async () => {
      const result = await advanceRenewalAction(subscriptionId);
      if (!result.ok) {
        setConfirmError({ error: result.error, hostedInvoiceUrl: result.hostedInvoiceUrl ?? null });
        return;
      }
      if (result.status === "requires_action") {
        // 3DS: la verificación la hace la factura alojada de Stripe.
        window.location.href = result.hostedInvoiceUrl;
        return;
      }
      toast.success(
        result.nextChargeAt
          ? `Renovación adelantada. Tu próximo cobro será el ${longDate(result.nextChargeAt)}.`
          : "Renovación adelantada."
      );
      onClose();
      router.refresh();
    });
  }

  const sepa = preview && !preview.ok && preview.code === "NOT_CARD";

  return createPortal(
    <div onClick={pending ? undefined : onClose} className="fixed inset-0 z-[80] flex items-center justify-center p-10 bg-[rgba(29,29,28,.55)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adelantar renovación"
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-full bg-white rounded-[20px] overflow-hidden shadow-pop"
        style={{ animation: "tzSelectPop .22s cubic-bezier(.2,.8,.2,1) both" }}
      >
        <div className="bg-brand-ink px-7 py-[26px]">
          <div className="inline-flex items-center gap-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-apta-gold">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
            Tu cuota mensual
          </div>
          <div className="font-display font-extrabold text-2xl leading-[1.1] uppercase text-white mt-3">Adelantar renovación</div>
          <p className="text-[13.5px] leading-[1.55] text-brand-muted-2 mt-2.5">
            Pagas ya el mes siguiente y tu nuevo ciclo empieza hoy.
          </p>
        </div>

        <div className="px-7 pt-[22px] pb-6 flex flex-col gap-3.5">
          {!preview ? (
            <p className="text-[13px] text-brand-muted">Consultando el importe…</p>
          ) : preview.ok ? (
            <>
              <div className="flex flex-col gap-2.5 border border-brand-border rounded-xl px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-brand-muted">Importe</span>
                  <span className="font-display font-extrabold text-lg text-brand-text">
                    {money(preview.amountCents, preview.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-brand-muted">Cobro</span>
                  <span className="text-[13px] font-semibold text-brand-text">Ahora, con tu tarjeta</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-brand-muted">Próximo cobro</span>
                  <span className="text-[13px] font-semibold text-brand-text">
                    {preview.nextChargeAt ? longDate(preview.nextChargeAt) : "—"}
                  </span>
                </div>
              </div>
              <p className="text-[12.5px] leading-[1.5] text-warning-text bg-warning-bg border border-warning/30 rounded-control px-3.5 py-2.5">
                Los días que quedan de tu periodo actual
                {preview.currentPeriodEnd ? ` (hasta el ${longDate(preview.currentPeriodEnd)})` : ""} se pierden: no se
                descuentan del importe.
              </p>
            </>
          ) : sepa ? (
            <>
              <p className="text-[13px] leading-[1.55] text-brand-text-2">{preview.error}</p>
              {oneOffPlans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between gap-3 border border-brand-border rounded-xl px-4 py-3.5">
                  <div className="text-[13.5px] font-bold text-brand-text">{plan.name}</div>
                  <div className="flex items-center gap-3">
                    <span className="font-display font-extrabold text-base text-brand-text">{plan.priceLabel}</span>
                    <PurchasePlanButton
                      planId={plan.id}
                      className="bg-brand-ink text-tz-bone rounded-lg px-3.5 py-[9px] text-xs font-extrabold uppercase disabled:opacity-60"
                    >
                      Comprar
                    </PurchasePlanButton>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="text-[13px] leading-[1.55] text-critical">{preview.error}</p>
          )}

          {confirmError && (
            <div className="rounded-control border border-critical/30 bg-critical-bg px-3.5 py-2.5 text-[12.5px] text-critical">
              {confirmError.error}
              {confirmError.hostedInvoiceUrl && (
                <>
                  {" "}
                  <a href={confirmError.hostedInvoiceUrl} className="underline font-semibold">
                    Pagar con otra tarjeta
                  </a>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2.5">
            {preview?.ok && (
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="flex-1 text-center bg-brand-ink text-tz-bone rounded-[10px] px-4 py-[13px] font-display font-extrabold text-[13px] uppercase tracking-[.03em] transition-colors duration-150 hover:bg-brand-ink-soft disabled:opacity-60"
              >
                {pending ? "Cobrando…" : `Pagar ${money(preview.amountCents, preview.currency)} ahora`}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="border border-brand-border text-brand-text-2 rounded-[10px] px-[18px] py-[13px] font-display font-bold text-[13px] transition-colors duration-150 hover:bg-tz-bone disabled:opacity-60"
            >
              {preview?.ok ? "Cancelar" : "Cerrar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

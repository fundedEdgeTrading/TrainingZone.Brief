"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** Compartido con sidebar.tsx (E8-05): la misma trampa de foco sirve a los dos cajones. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function Drawer({
  open,
  onClose,
  kicker,
  title,
  widthClassName = "sm:w-[520px]",
  children,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  widthClassName?: string;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  // E8-05: quién tenía el foco antes de abrir, para devolvérselo al cerrar —
  // sin esto, cerrar el drawer con Escape o el botón dejaba el foco en el
  // documento (normalmente al principio), en vez de donde estaba quien lo abrió.
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;

    // El foco entra en el panel al abrir: el primer elemento enfocable, o el
    // propio panel si no hay ninguno (formularios que tardan en montar sus campos).
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables?.[0] ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Trampa de foco: Tab no puede salir del panel mientras esté abierto.
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(active)) {
        // El foco se escapó por otra vía (p.ej. un elemento desmontado): lo
        // devuelve al panel en vez de dejarlo perdido en el documento.
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Vuelve al elemento que lo abrió, si sigue en el documento.
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  // Se renderiza en un portal a document.body: un ancestro de la página con una
  // animación de entrada (transform) crearía un containing block nuevo y rompería
  // el position:fixed del drawer (se saldría de la pantalla real).
  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-tz-black/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // E8-05: cerrado, el panel no es alcanzable con tabulador ni por
        // lector de pantalla — antes solo se apartaba con translate-x-full,
        // así que tabular desde detrás caía dentro de un formulario invisible.
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 w-full ${widthClassName} sm:max-w-[92vw] bg-white border-l border-brand-border shadow-pop flex flex-col transition-transform duration-350 ease-[cubic-bezier(.2,.8,.2,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-6 sm:px-7 py-5 sm:py-6 border-b border-tz-sand flex items-center justify-between shrink-0 sticky top-0 bg-white z-10">
          <div>
            <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">
              {kicker}
            </div>
            <div className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-brand-text mt-0.5">
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-[34px] h-[34px] rounded-full border border-brand-border bg-white text-brand-text-2 transition-colors duration-150 hover:bg-tz-bone shrink-0"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>,
    document.body
  );
}

export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 justify-end px-6 sm:px-7 py-5 border-t border-tz-sand bg-white sticky bottom-0">
      {children}
    </div>
  );
}

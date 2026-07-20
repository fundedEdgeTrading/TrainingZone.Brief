"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-tz-black/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
    </>
  );
}

export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 justify-end px-6 sm:px-7 py-5 border-t border-tz-sand bg-white sticky bottom-0">
      {children}
    </div>
  );
}

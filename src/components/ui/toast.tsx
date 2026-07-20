"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import clsx from "clsx";

type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
};

type ToastInput = {
  title: string;
  description?: string;
  duration?: number;
};

type ToastContextValue = {
  success: (input: ToastInput | string) => void;
  error: (input: ToastInput | string) => void;
  warning: (input: ToastInput | string) => void;
  info: (input: ToastInput | string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4200;

const VARIANT_STYLE: Record<
  ToastVariant,
  { accent: string; iconBg: string; iconColor: string; icon: React.ReactNode }
> = {
  success: {
    accent: "bg-good",
    iconBg: "bg-good-bg",
    iconColor: "text-good",
    icon: (
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  error: {
    accent: "bg-critical",
    iconBg: "bg-critical-bg",
    iconColor: "text-critical",
    icon: (
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  warning: {
    accent: "bg-warning",
    iconBg: "bg-warning-bg",
    iconColor: "text-warning",
    icon: (
      <path
        d="M12 9v4.5M12 17h.01M10.6 3.9L2.9 17.5c-.5.9.1 2 1.1 2h16c1 0 1.6-1.1 1.1-2L13.4 3.9c-.5-.9-1.8-.9-2.3 0Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  info: {
    accent: "bg-tz-black",
    iconBg: "bg-tz-sand",
    iconColor: "text-tz-black",
    icon: (
      <path d="M12 8h.01M11 12h1v5h1" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, input: ToastInput | string) => {
      const { title, description, duration } =
        typeof input === "string" ? { title: input, description: undefined, duration: undefined } : input;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, variant, title, description }]);
      const timer = setTimeout(() => dismiss(id), duration ?? DEFAULT_DURATION);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    success: (input) => push("success", input),
    error: (input) => push("error", input),
    warning: (input) => push("warning", input),
    info: (input) => push("info", input),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5 w-[min(380px,calc(100vw-2rem))] pointer-events-none"
        role="region"
        aria-label="Notificaciones"
      >
        {toasts.map((t) => {
          const style = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className="tz-toast pointer-events-auto relative overflow-hidden bg-white border border-brand-border rounded-2xl shadow-pop flex items-start gap-3 pl-4 pr-3 py-3.5"
            >
              <span className={clsx("absolute left-0 top-0 bottom-0 w-1", style.accent)} />
              <span
                className={clsx(
                  "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                  style.iconBg,
                  style.iconColor
                )}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  {style.icon}
                </svg>
              </span>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-sm font-bold text-brand-text leading-tight">{t.title}</div>
                {t.description && (
                  <div className="text-[13px] text-brand-text-2 mt-0.5 leading-snug">{t.description}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar notificación"
                className="shrink-0 -mr-1 w-6 h-6 rounded-full flex items-center justify-center text-brand-muted transition-colors duration-150 hover:bg-tz-bone hover:text-brand-text"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

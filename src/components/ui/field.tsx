"use client";

import clsx from "clsx";
import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";

const LABEL = "block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5";

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {label && <label className={LABEL}>{label}</label>}
      {children}
      {error ? (
        <p className="text-xs text-critical mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-brand-muted mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CONTROL, className)} {...props} />;
}

type Tone = "good" | "warning" | "critical" | "trial" | "prospect" | "neutral";

const TONE_DOT: Record<Tone, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  trial: "bg-trial",
  prospect: "bg-prospect",
  neutral: "bg-neutral",
};

type Option = { value: string; label: string; disabled?: boolean; tone?: Tone };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function optionsFromChildren(children: ReactNode): Option[] {
  const options: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement> & { "data-tone"?: Tone };
    const label = textOf(props.children);
    options.push({
      value: props.value != null ? String(props.value) : label,
      label,
      disabled: props.disabled,
      tone: props["data-tone"],
    });
  });
  return options;
}

/**
 * Desplegable de marca: sustituye el `<select>` nativo (cuyo popover el navegador
 * pinta con el estilo del SO) por una lista propia, manteniendo la misma API
 * basada en `<option>` children para no tocar los call-sites existentes.
 */
export function Select({
  className,
  children,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  searchable = false,
  placeholder = "Seleccionar...",
}: React.SelectHTMLAttributes<HTMLSelectElement> & { searchable?: boolean; placeholder?: string }) {
  const options = useMemo(() => optionsFromChildren(children), [children]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => {
    if (defaultValue != null) return String(defaultValue);
    return options.find((o) => !o.disabled)?.value ?? "";
  });
  const currentValue = isControlled ? String(value ?? "") : internalValue;
  const selected = options.find((o) => o.value === currentValue);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function selectOption(opt: Option) {
    if (opt.disabled) return;
    if (!isControlled) setInternalValue(opt.value);
    setOpen(false);
    setQuery("");
    onChange?.({ target: { value: opt.value, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div ref={rootRef} className={clsx("relative w-full", className)}>
      {name && <input type="hidden" name={name} value={currentValue} required={required} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className={clsx(
          "box-border flex w-full cursor-pointer items-center justify-between gap-2 rounded-control bg-white px-3.5 py-2.5 text-left text-sm transition-[border-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-50",
          open ? "border border-brand-ink ring-2 ring-tz-black/10" : "border border-brand-border hover:border-brand-border-hover",
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {selected?.tone && <span className={clsx("h-2 w-2 shrink-0 rounded-[3px]", TONE_DOT[selected.tone])} />}
          <span className={clsx("truncate font-medium", selected ? "text-brand-text" : "text-faint")}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx("shrink-0 text-brand-muted transition-transform duration-[180ms] ease-out-soft", open && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="tz-select-pop absolute left-0 right-0 top-[calc(100%+6px)] z-[60] rounded-[13px] border border-brand-border bg-white p-1.5 shadow-pop">
          {searchable && (
            <div className="p-0.5 pb-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full box-border rounded-[9px] border border-brand-border bg-tz-bone px-[11px] py-2 text-[13px] text-brand-text outline-none"
              />
            </div>
          )}
          <div className="flex max-h-60 flex-col gap-0.5 overflow-auto [scrollbar-color:var(--color-tz-linen)_transparent]">
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => selectOption(opt)}
                className={clsx(
                  "flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40",
                  opt.value === currentValue ? "bg-tz-bone font-semibold" : "font-medium hover:bg-tz-bone",
                )}
              >
                <span className="inline-flex min-w-0 items-center gap-2.5">
                  {opt.tone && <span className={clsx("h-2 w-2 shrink-0 rounded-[3px]", TONE_DOT[opt.tone])} />}
                  <span className="truncate">{opt.label}</span>
                </span>
                {opt.value === currentValue && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#8a6d2f"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-3.5 text-center text-[13px] text-faint">Sin resultados</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(CONTROL, "resize-y min-h-[84px]", className)} {...props} />;
}

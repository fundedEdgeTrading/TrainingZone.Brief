"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import type { BadgeTone } from "@/components/ui/badge";
import { useMediaQuery } from "@/lib/use-media-query";
import { usePopoverPosition } from "@/lib/use-popover-position";

export type FilterOption = {
  value: string;
  label: string;
  tone?: BadgeTone;
  /** Filas que quedarían si se añade esta opción manteniendo el resto de filtros. */
  count?: number;
};

const TONE_DOT: Record<BadgeTone, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  trial: "bg-trial",
  prospect: "bg-prospect",
  neutral: "bg-neutral",
  gold: "bg-gold",
};

/** Por debajo de este ancho el panel se pinta como hoja inferior, igual que `Select`. */
const MOBILE_QUERY = "(max-width: 639px)";
/** Estimación al alza del alto de una fila de opción y de la cabecera del panel. */
const OPTION_ROW = 40;
const PANEL_HEADER = 34;

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Panel de filtro multi-selección: el mismo para la barra unificada, para el
 * riel de la tabla y para la cabecera de una columna. Se aplica al instante —no
 * hay botón «Filtrar»—, así que cada opción escribe en cuanto se marca.
 *
 * Se pinta en un portal a `document.body` con `position: fixed` y la colocación
 * compartida de `usePopoverPosition`: anclado con `absolute` lo recortaría el
 * `overflow` del cuerpo de la tabla o de un drawer.
 *
 * Accesibilidad: el disparador es un `button` con `aria-haspopup="listbox"`, y
 * cada opción un `button` con `role="checkbox"` — selección múltiple real, no
 * `option`. Sin `role="combobox"`: ese rol prohíbe calcular el nombre accesible
 * a partir del contenido (mismo motivo que documenta `field.tsx`).
 */
export function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  onClear,
  width = 252,
  align = "left",
  variant = "pill",
  showCount = true,
  children,
  className,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle?: (value: string) => void;
  onClear: () => void;
  /** Ancho del panel por eje (ver handoff). */
  width?: number;
  align?: "left" | "right";
  /** `pill` en la barra y el riel; `glyph` en la cabecera de columna. */
  variant?: "pill" | "glyph";
  /** Los ejes de selección única llevan el valor en el rótulo, no un contador. */
  showCount?: boolean;
  /**
   * Contenido propio del panel en lugar de la lista de opciones: lo usa el eje
   * de rango de fechas, que son dos campos y no una selección.
   */
  children?: React.ReactNode;
  className?: string;
}) {
  const mounted = useMounted();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { position, place, reset } = usePopoverPosition({
    triggerRef,
    estimateHeight: options.length * OPTION_ROW + PANEL_HEADER + 12,
    width,
    align,
  });

  const count = selected.length;
  const active = count > 0;

  const close = useCallback(
    (focusTrigger = false) => {
      setOpen(false);
      reset();
      if (focusTrigger) triggerRef.current?.focus();
    },
    [reset],
  );

  const toggleOpen = useCallback(() => {
    if (open) {
      close();
      return;
    }
    if (!isMobile) place(false);
    setOpen(true);
  }, [open, close, place, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    // `true` en captura: el scroll de un ancestro (el cuerpo de la tabla, un
    // drawer) no burbujea a window. `place(true)`: se recolocan coordenadas,
    // nunca el lado.
    const onReflow = () => {
      if (!isMobile) place(true);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, close, place, isMobile]);

  // En móvil la hoja ocupa la pantalla: se bloquea el scroll de fondo, igual
  // que hacen `Select` y el `Drawer`.
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  /** ↑/↓ recorren las opciones sin sacar el foco del panel. */
  function onOptionsKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-filter-option]") ?? []);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at <= 0 ? items.length : at) - 1;
    items[next]?.focus();
  }

  const panelBody = children ?? (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-color:var(--color-tz-linen)_transparent]">
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            data-filter-option=""
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle?.(opt.value)}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-[9px] px-[9px] text-left transition-colors duration-100 hover:bg-tz-bone",
              isMobile ? "min-h-[48px] py-3 text-[15px]" : "py-2 text-[13.5px]",
              on ? "bg-tz-bone font-semibold" : "font-medium",
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                "inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-100",
                on ? "border-brand-ink bg-tz-black" : "border-brand-border bg-white",
              )}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-tz-bone)"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={clsx(!on && "opacity-0")}
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            {opt.tone && (
              <span aria-hidden="true" className={clsx("h-2 w-2 shrink-0 rounded-[3px]", TONE_DOT[opt.tone])} />
            )}
            <span className="min-w-0 flex-1 leading-[1.35] text-brand-text">{opt.label}</span>
            {opt.count != null && <span className="shrink-0 text-[11.5px] text-faint tz-nums">{opt.count}</span>}
          </button>
        );
      })}
      {options.length === 0 && <div className="px-3 py-3.5 text-center text-[13px] text-faint">Sin opciones</div>}
    </div>
  );

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-[7px] pt-[5px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">{label}</span>
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11.5px] font-semibold text-brand-muted transition-colors hover:text-brand-text"
        >
          Limpiar
        </button>
      )}
    </div>
  );

  const menu = !open ? null : isMobile ? (
    <div className="fixed inset-0 z-[200]">
      <div aria-hidden="true" onClick={() => close()} className="absolute inset-0 bg-tz-black/45" />
      <div
        ref={menuRef}
        onKeyDown={onOptionsKeyDown}
        className="tz-select-sheet absolute inset-x-0 bottom-0 flex max-h-[82%] flex-col rounded-t-[22px] border-t border-brand-border bg-white px-3 pb-4 pt-2.5 shadow-pop"
      >
        <div className="flex shrink-0 justify-center py-1.5">
          <span className="h-1 w-11 rounded-full bg-brand-border" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-2 pb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">{label}</span>
          <span className="flex items-center gap-3">
            {active && (
              <button type="button" onClick={onClear} className="text-[13px] font-semibold text-brand-muted">
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => close(true)}
              className="px-1.5 py-1 text-[13.5px] font-semibold text-brand-text-2"
            >
              Cerrar
            </button>
          </span>
        </div>
        {panelBody}
      </div>
    </div>
  ) : position ? (
    <div
      ref={menuRef}
      onKeyDown={onOptionsKeyDown}
      className="tz-select-pop fixed z-[200] flex flex-col rounded-[13px] border border-brand-border bg-white p-1.5 shadow-pop"
      style={{
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        width: position.width,
        maxHeight: position.maxHeight,
        transformOrigin: position.side === "top" ? "bottom left" : "top left",
      }}
    >
      {header}
      {panelBody}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={clsx("relative shrink-0", className)}>
      {variant === "pill" ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggleOpen}
          className={clsx(
            "relative inline-flex cursor-pointer items-center gap-[7px] overflow-hidden rounded-pill border py-[7px] pl-[13px] pr-3 text-[13px] font-semibold whitespace-nowrap transition-[background-color,border-color,color] duration-[180ms] ease-out-soft",
            active
              ? "border-brand-ink bg-tz-black text-tz-bone"
              : "border-brand-border bg-white text-brand-text-2 hover:border-brand-border-hover",
          )}
        >
          {/* Al pasar a activa, un destello dorado recorre la píldora una vez:
              el mismo recurso que el item activo del NavBar. */}
          {active && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-pill">
              <span
                className="absolute bottom-0 left-0 top-0 w-[45%]"
                style={{
                  background: "linear-gradient(105deg,transparent,rgba(200,171,114,.5) 50%,transparent)",
                  animation: "tzPillSheen .9s var(--ease-out-soft) both",
                }}
              />
            </span>
          )}
          {label}
          {active && showCount && (
            <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-pill bg-apta-gold px-[5px] text-[10.5px] font-bold text-tz-black tz-nums">
              {count}
            </span>
          )}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={clsx("shrink-0 opacity-70 transition-transform duration-[180ms] ease-out-soft", open && "rotate-180")}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={active ? `Filtrar por ${label} (${count} activos)` : `Filtrar por ${label}`}
          onClick={toggleOpen}
          className={clsx(
            "inline-flex cursor-pointer items-center gap-[5px] rounded-[7px] px-1.5 py-[3px] transition-colors duration-150 hover:bg-tz-sand hover:text-brand-text",
            active ? "bg-gold-bg text-gold" : "text-faint",
          )}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4h18l-7 8v6l-4 2v-8z" />
          </svg>
          {active && <span className="text-[10px] font-bold tz-nums">{count}</span>}
        </button>
      )}

      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

"use client";

import clsx from "clsx";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useMediaQuery } from "@/lib/use-media-query";

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

/** Alto máximo de la lista: nunca ocupa más que el hueco libre en pantalla. */
const MENU_MAX_HEIGHT = 300;
const MENU_GAP = 6;
/** Ancho mínimo de la lista, aunque el disparador sea más estrecho. */
const MENU_MIN_WIDTH = 260;
/** Margen mínimo con los bordes del viewport (también evita la barra de gestos). */
const VIEWPORT_MARGIN = 10;
/** Alto aproximado de una opción y del buscador: sirve para estimar si la lista
    cabe debajo del campo. Es una estimación al alza a propósito. */
const OPTION_ROW = 44;
const SEARCH_ROW = 48;
/** A partir de tantas opciones el buscador aparece solo. */
const SEARCH_FROM = 8;
/** Por debajo de este ancho la lista se pinta como hoja inferior. */
const MOBILE_QUERY = "(max-width: 639px)";

type MenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  side: "top" | "bottom";
  /** Volteada se ancla por `bottom` (ver comentario en placeMenu). */
  top?: number;
  bottom?: number;
};

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Desplegable de marca: sustituye el `<select>` nativo (cuyo popover el navegador
 * pinta con el estilo del SO) por una lista propia, manteniendo la misma API
 * basada en `<option>` children para no tocar los call-sites existentes.
 *
 * La lista se pinta en un portal a `document.body` con `position: fixed`: dentro
 * de un drawer, un modal o una tabla con `overflow`, un popover `absolute` lo
 * recortaba el ancestro con scroll (y de paso le añadía barras de scroll a ese
 * ancestro).
 *
 * Reglas de colocación (ver docs del handoff):
 * 1. Abre hacia abajo. Solo se voltea si el alto REAL estimado de sus opciones
 *    no cabe debajo y arriba hay más hueco — antes se comparaba contra el
 *    máximo fijo (288 px), así que dentro de un drawer se volteaba casi siempre.
 * 2. El lado se decide al abrir y no cambia mientras está abierta: en
 *    scroll/resize se recalculan las coordenadas con el mismo `side`.
 * 3. Volteada se ancla por `bottom` al borde superior del campo, no por un
 *    `top` calculado con la estimación: si el contenido real mide menos, la
 *    lista sigue pegada al campo en vez de flotar por encima.
 * 4. El valor y las opciones se parten en dos líneas antes de recortar.
 * 5. Por debajo de 640 px la lista se pinta como hoja inferior.
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
  searchable,
  placeholder = "Seleccionar...",
}: React.SelectHTMLAttributes<HTMLSelectElement> & { searchable?: boolean; placeholder?: string }) {
  const options = useMemo(() => optionsFromChildren(children), [children]);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => {
    if (defaultValue != null) return String(defaultValue);
    return options.find((o) => !o.disabled)?.value ?? "";
  });
  const currentValue = isControlled ? String(value ?? "") : internalValue;
  const selected = options.find((o) => o.value === currentValue && !o.disabled);

  const mounted = useMounted();
  // La hoja inferior entra por debajo de 640px, no en el breakpoint `lg`
  // del `useIsMobile` compartido: por eso la consulta va explícita.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const withSearch = searchable ?? options.length >= SEARCH_FROM;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Lado elegido al abrir: se conserva hasta cerrar (regla 2). */
  const sideRef = useRef<"top" | "bottom">("bottom");

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setPosition(null);
  }, []);

  const placeMenu = useCallback(
    (keepSide: boolean) => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      const needed = Math.min(
        MENU_MAX_HEIGHT,
        options.length * OPTION_ROW + (withSearch ? SEARCH_ROW : 0) + 12,
      );
      const below = vh - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const above = rect.top - MENU_GAP - VIEWPORT_MARGIN;

      const side = keepSide ? sideRef.current : below < needed && above > below ? "top" : "bottom";
      sideRef.current = side;

      const space = Math.max(140, side === "top" ? above : below);
      const maxHeight = Math.min(needed, space);
      const width = Math.min(Math.max(rect.width, MENU_MIN_WIDTH), vw - VIEWPORT_MARGIN * 2);
      const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), vw - width - VIEWPORT_MARGIN);

      setPosition(
        side === "top"
          ? { side, left, width, maxHeight, bottom: Math.max(VIEWPORT_MARGIN, vh - rect.top + MENU_GAP) }
          : { side, left, width, maxHeight, top: Math.min(rect.bottom + MENU_GAP, vh - VIEWPORT_MARGIN - maxHeight) },
      );
    },
    [options.length, withSearch],
  );

  // La posición se calcula al abrir (en el propio manejador) y se recalcula en
  // scroll/resize, no en un efecto: así no hay un render extra con la lista
  // todavía sin colocar.
  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    setQuery("");
    if (!isMobile) placeMenu(false);
    setOpen(true);
  }, [open, close, placeMenu, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // `true` en captura: así también se recoloca cuando el scroll ocurre en un
    // ancestro (el cuerpo de un drawer, una tabla), que no burbujea a window.
    // `keepSide`: se recolocan coordenadas, nunca el lado.
    const onReflow = () => {
      if (!isMobile) placeMenu(true);
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
  }, [open, close, placeMenu, isMobile]);

  // En móvil la hoja ocupa la pantalla: se bloquea el scroll de fondo, igual
  // que hace el Drawer.
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function selectOption(opt: Option) {
    if (opt.disabled) return;
    if (!isControlled) setInternalValue(opt.value);
    close();
    onChange?.({ target: { value: opt.value, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  }

  const hasWidthOverride = /(^|\s)w-/.test(className ?? "");

  const optionList = (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-color:var(--color-tz-linen)_transparent]">
      {filtered.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          onClick={() => selectOption(opt)}
          className={clsx(
            "flex w-full items-start justify-between gap-2.5 rounded-lg px-3 text-left transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40",
            isMobile ? "min-h-[48px] py-3 text-[15px]" : "py-2.5 text-sm",
            opt.value === currentValue ? "bg-tz-bone font-semibold" : "font-medium hover:bg-tz-bone",
          )}
        >
          <span className="inline-flex min-w-0 items-start gap-2.5">
            {opt.tone && <span className={clsx("mt-[5px] h-2 w-2 shrink-0 rounded-[3px]", TONE_DOT[opt.tone])} />}
            {/* Dos líneas antes de recortar: los nombres de centro y de plan son largos. */}
            <span className="line-clamp-2 leading-[1.35]">{opt.label}</span>
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
              className="mt-0.5 shrink-0"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </button>
      ))}
      {filtered.length === 0 && <div className="px-3 py-3.5 text-center text-[13px] text-faint">Sin resultados</div>}
    </div>
  );

  const searchBox = withSearch ? (
    <div className="shrink-0 p-0.5 pb-1.5">
      <input
        autoFocus={!isMobile}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar..."
        className="w-full box-border rounded-[9px] border border-brand-border bg-tz-bone px-[11px] py-2 text-[13px] text-brand-text outline-none"
      />
    </div>
  ) : null;

  const menu = !open ? null : isMobile ? (
    // Hoja inferior: no hay posición que calcular, la lista no cabe junto al
    // campo y el teclado del sistema taparía media pantalla.
    <div className="fixed inset-0 z-[200]">
      <div aria-hidden="true" onClick={close} className="absolute inset-0 bg-tz-black/45" />
      <div
        ref={menuRef}
        className="tz-select-sheet absolute inset-x-0 bottom-0 flex max-h-[82%] flex-col rounded-t-[22px] border-t border-brand-border bg-white px-3 pb-4 pt-2.5 shadow-pop"
      >
        <div className="flex shrink-0 justify-center py-1.5">
          <span className="h-1 w-11 rounded-full bg-brand-border" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-2 pb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">{placeholder}</span>
          <button type="button" onClick={close} className="px-1.5 py-1 text-[13.5px] font-semibold text-brand-text-2">
            Cerrar
          </button>
        </div>
        {searchBox}
        {optionList}
      </div>
    </div>
  ) : position ? (
    <div
      ref={menuRef}
      className="tz-select-pop fixed z-[200] flex flex-col rounded-[13px] border border-brand-border bg-white p-1.5 shadow-pop"
      style={{
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        width: position.width,
        maxHeight: position.maxHeight,
        transformOrigin: position.side === "top" ? "bottom center" : "top center",
      }}
    >
      {searchBox}
      {optionList}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={clsx("relative", !hasWidthOverride && "w-full", className)}>
      {name && <input type="hidden" name={name} value={currentValue} required={required} />}
      <button
        ref={triggerRef}
        type="button"
        // Sin `role="combobox"` ni `role="option"`: ese rol prohíbe calcular el
        // nombre accesible a partir del contenido y dejaría sin nombre tanto al
        // disparador (cuya etiqueta es el valor elegido) como a cada opción.
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className={clsx(
          // `items-start` y sin alto fijo: el campo crece a dos líneas cuando el
          // valor es largo, en vez de recortarlo con puntos suspensivos.
          "box-border flex w-full cursor-pointer items-start justify-between gap-2 rounded-control bg-white px-3.5 py-2.5 text-left text-sm transition-[border-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-50",
          open ? "border border-brand-ink ring-2 ring-tz-black/10" : "border border-brand-border hover:border-brand-border-hover",
        )}
      >
        <span className="inline-flex min-w-0 items-start gap-2">
          {selected?.tone && <span className={clsx("mt-[5px] h-2 w-2 shrink-0 rounded-[3px]", TONE_DOT[selected.tone])} />}
          <span className={clsx("line-clamp-2 leading-[1.35] font-medium", selected ? "text-brand-text" : "text-faint")}>
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
          className={clsx(
            "mt-[3px] shrink-0 text-brand-muted transition-transform duration-[180ms] ease-out-soft",
            open && "rotate-180",
          )}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(CONTROL, "resize-y min-h-[84px]", className)} {...props} />;
}

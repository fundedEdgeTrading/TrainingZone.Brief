"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import clsx from "clsx";

/**
 * Rail de secciones de la ficha de socio. Sustituye a la fila de pestañas.
 *
 *   · un único punto de corte (`lg`): columna a la izquierda en escritorio,
 *     fila con scroll horizontal en móvil.
 *   · sin `scrollIntoView` (prohibido en el proyecto): el item activo se
 *     centra con `scrollLeft` calculado sobre su `offsetLeft`.
 *   · la sección se refleja en la URL con `replaceState`, sin re-render del
 *     server component: cada lectura de salud escribe una fila de auditoría
 *     (ADR-008), así que una navegación de Next por cambio de sección dejaría
 *     accesos falsos en el log.
 */

export type SectionKey = "socio" | "plan" | "actividad" | "entreno" | "evolucion";

/**
 * Petición de foco que viaja de la cabecera al panel: «Editar datos» abre el
 * drawer de datos dentro de Socio y «Nueva nota» enfoca el composer de
 * Actividad. Se resuelve en el mismo commit en que se monta el panel, así que
 * el destinatario la recibe ya montado (ver `useFocusRequest`).
 */
export type FocusRequest = "edit" | "note";

export type Section = {
  key: SectionKey;
  label: string;
  /** Contador vivo: "1 bono activo · 3 sesiones". Solo visible en escritorio. */
  meta?: string;
  content: React.ReactNode;
};

type Nav = {
  active: SectionKey;
  go: (key: SectionKey, focus?: FocusRequest) => void;
  focus: FocusRequest | null;
  clearFocus: () => void;
};

const SectionNavContext = createContext<Nav | null>(null);

export function useSectionNav() {
  const nav = useContext(SectionNavContext);
  if (!nav) throw new Error("useSectionNav debe usarse dentro de <SectionRail>");
  return nav;
}

/**
 * Ejecuta `onRequest` cuando la cabecera pide el foco de este panel. El
 * callback se guarda en una ref para no reejecutar el efecto en cada render del
 * componente que lo usa.
 */
export function useFocusRequest(target: FocusRequest, onRequest: () => void) {
  const nav = useContext(SectionNavContext);
  const focus = nav?.focus ?? null;
  const clearFocus = nav?.clearFocus;
  const handler = useRef(onRequest);

  useEffect(() => {
    handler.current = onRequest;
  });

  useEffect(() => {
    if (focus !== target) return;
    handler.current();
    clearFocus?.();
  }, [focus, target, clearFocus]);
}

export default function SectionRail({
  sections,
  initial,
  header,
}: {
  sections: Section[];
  initial?: SectionKey;
  /** Cabecera del socio: vive dentro del provider para poder cambiar de sección. */
  header?: React.ReactNode;
}) {
  const [active, setActive] = useState<SectionKey>(
    initial && sections.some((s) => s.key === initial) ? initial : sections[0].key
  );
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // El rail horizontal de móvil arranca con el item activo a la vista.
  useEffect(() => {
    const list = listRef.current;
    const item = activeRef.current;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = Math.max(0, item.offsetLeft - (list.clientWidth - item.clientWidth) / 2);
  }, [active]);

  const go = useCallback((key: SectionKey, nextFocus?: FocusRequest) => {
    setActive(key);
    setFocus(nextFocus ?? null);
    const url = new URL(window.location.href);
    url.searchParams.set("s", key);
    window.history.replaceState(null, "", url);
  }, []);

  const clearFocus = useCallback(() => setFocus(null), []);

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = sections.findIndex((s) => s.key === active);
    go(sections[(i + dir + sections.length) % sections.length].key);
  }

  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <SectionNavContext.Provider value={{ active, go, focus, clearFocus }}>
      {header}
      <div className="grid grid-cols-1 lg:grid-cols-[252px_minmax(0,1fr)] gap-4 items-start">
        <nav
          ref={listRef}
          role="tablist"
          aria-label="Secciones de la ficha"
          onKeyDown={onKeyDown}
          className="tz-rail-scroll sticky top-0 z-[5] bg-brand-card border border-brand-border rounded-card shadow-card p-2 lg:p-2.5 flex flex-row lg:flex-col gap-0.5 overflow-x-auto lg:overflow-x-visible"
        >
          <div className="hidden lg:block px-3 pt-1.5 pb-2.5 font-display font-bold text-[10px] tracking-[.14em] uppercase text-brand-faint">
            Ficha
          </div>
          {sections.map((s) => {
            const on = s.key === active;
            return (
              <button
                key={s.key}
                ref={on ? activeRef : undefined}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`panel-${s.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(s.key)}
                className={clsx(
                  "shrink-0 text-left rounded-xl px-3.5 py-2.5 flex flex-col gap-[3px] transition-[background-color,color] duration-200 ease-out-soft",
                  on ? "bg-tz-black text-tz-bone" : "text-text-2 hover:bg-tz-linen/50"
                )}
              >
                <span className="text-sm font-semibold whitespace-nowrap">{s.label}</span>
                {s.meta && (
                  // Decorativa: el nombre accesible del tab es solo la etiqueta.
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "hidden lg:block text-[11px]",
                      on ? "text-tz-bone/60" : "text-brand-faint"
                    )}
                  >
                    {s.meta}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div
          id={`panel-${current.key}`}
          role="tabpanel"
          aria-label={current.label}
          className="min-w-0 bg-brand-card border border-brand-border rounded-card shadow-card p-[18px] lg:p-7"
        >
          {/* key: remonta el panel para que la entrada vuelva a correr */}
          <div
            key={current.key}
            className="tz-fade-up flex flex-col gap-6"
            style={{ animationDuration: "0.3s" }}
          >
            {current.content}
          </div>
        </div>
      </div>
    </SectionNavContext.Provider>
  );
}

/** Cabecera común de sección: kicker + h2 + descripción o acciones. */
export function SectionHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap border-b border-brand-subtle-2 pb-3.5">
      <div>
        <div className="font-display font-bold text-[10px] tracking-[.14em] uppercase text-brand-muted">
          Sección
        </div>
        <h2 className="mt-1 font-display font-extrabold text-xl tracking-[-.01em] text-brand-text">
          {title}
        </h2>
      </div>
      {actions ?? (description && <p className="text-xs text-brand-muted max-w-[340px] text-pretty">{description}</p>)}
    </div>
  );
}

/**
 * Cabecera de sección cuyos botones despliegan un formulario debajo, en vez de
 * dejarlo montado en la página como hasta ahora (Plan y pagos abría cuatro
 * formularios a la vez).
 */
export function SectionHeadDisclosure({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; variant?: "primary" | "secondary"; content: React.ReactNode }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const current = items.find((i) => i.key === open);

  return (
    <div className="flex flex-col gap-4">
      <SectionHead
        title={title}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {items.map((item) => {
              const on = open === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? null : item.key)}
                  className={clsx(
                    "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap px-4 py-2 text-sm rounded-control transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out-soft active:scale-[0.97]",
                    item.variant === "primary"
                      ? "bg-tz-black text-tz-bone shadow-card hover:shadow-hover"
                      : "bg-white text-brand-text border border-brand-border hover:border-brand-ink hover:bg-tz-bone"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        }
      />
      {current && (
        <div
          className="tz-fade-up bg-brand-bg border border-brand-border rounded-[14px] p-[18px_20px]"
          style={{ animationDuration: "0.25s" }}
        >
          {current.content}
        </div>
      )}
    </div>
  );
}

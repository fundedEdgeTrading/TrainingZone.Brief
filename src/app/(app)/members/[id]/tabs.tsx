"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Pestañas de la ficha de socio con indicador deslizante.
 *
 * Las etiquetas tienen anchos dispares y la fila puede envolver en dos líneas,
 * así que el indicador no se puede posicionar con porcentajes: se mide el botón
 * activo respecto al contenedor. La medida se hace en el callback ref del botón
 * activo — no en un efecto — así que ocurre en el mismo commit en que cambia la
 * pestaña y no hay parpadeo.
 */
export default function Tabs({
  panels,
}: {
  panels: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(panels[0]?.key);
  const [rect, setRect] = useState<Rect | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const measureActive = useCallback((node: HTMLButtonElement | null) => {
    const list = listRef.current;
    if (!node || !list) return;
    const a = node.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    setRect({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height });
  }, []);

  return (
    <div>
      <div ref={listRef} className="relative inline-flex flex-wrap gap-1 max-w-full bg-tz-sand rounded-pill p-1 mb-5">
        {rect && (
          <span
            aria-hidden="true"
            className="absolute rounded-pill bg-tz-black shadow-card transition-[transform,width,height] duration-[320ms] ease-spring pointer-events-none"
            style={{
              left: 0,
              top: 0,
              width: rect.width,
              height: rect.height,
              transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
            }}
          />
        )}
        {panels.map((p) => (
          <button
            key={p.key}
            ref={active === p.key ? measureActive : undefined}
            onClick={() => setActive(p.key)}
            className={clsx(
              "relative z-10 rounded-pill px-4 py-2 text-sm font-semibold transition-colors duration-200",
              active === p.key ? "text-tz-bone" : "text-text-2 hover:bg-tz-linen/50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) =>
        active === p.key ? (
          <div key={p.key} className="tz-fade-up" style={{ animationDuration: "0.3s" }}>
            {p.content}
          </div>
        ) : null
      )}
    </div>
  );
}

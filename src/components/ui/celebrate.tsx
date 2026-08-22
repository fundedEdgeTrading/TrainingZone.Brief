"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const COLORS = ["#1d1d1c", "#c8ab72", "#d8ccb8", "#4b5a22", "#5b5748"];

type Piece = {
  id: string;
  left: number;
  top: number;
  cx: string;
  cy: string;
  cr: string;
  delay: string;
  color: string;
};

type Fire = (origin?: { x: number; y: number }) => void;

const Ctx = createContext<Fire | null>(null);

/**
 * Celebración sobria de hitos: 26 cuadrados de 8px con los colores de marca,
 * 1,2 s, sin bucle y sin sonido. Se dispara solo en los cuatro hitos acordados
 * (reserva confirmada, fin de la puesta en marcha, objetivo cumplido y lead
 * cerrado): si celebra todo, no celebra nada.
 */
export function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const seq = useRef(0);

  const fire = useCallback<Fire>((origin) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 3;
    const run = ++seq.current;
    setPieces(
      Array.from({ length: 26 }, (_, i) => {
        const ang = -Math.PI * (0.15 + Math.random() * 0.7);
        const dist = 90 + Math.random() * 190;
        return {
          id: `${run}-${i}`,
          left: x,
          top: y,
          cx: `${Math.round(Math.cos(ang) * dist * (Math.random() < 0.5 ? -1 : 1))}px`,
          cy: `${Math.round(Math.sin(ang) * dist + 140)}px`,
          cr: `${Math.round(-220 + Math.random() * 440)}deg`,
          delay: `${(Math.random() * 0.12).toFixed(2)}s`,
          color: COLORS[i % COLORS.length],
        };
      })
    );
    setTimeout(() => {
      // Solo limpia si no ha entrado una celebración más nueva por medio.
      if (seq.current === run) setPieces([]);
    }, 1600);
  }, []);

  return (
    <Ctx.Provider value={fire}>
      {children}
      <div className="fixed inset-0 z-[120] pointer-events-none overflow-hidden" aria-hidden="true">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="absolute w-2 h-2 rounded-[2px]"
            style={
              {
                left: p.left,
                top: p.top,
                background: p.color,
                "--cx": p.cx,
                "--cy": p.cy,
                "--cr": p.cr,
                animation: "tzConfetti 1.2s cubic-bezier(.2,.7,.3,1) both",
                animationDelay: p.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useCelebrate(): Fire {
  const fire = useContext(Ctx);
  if (!fire) throw new Error("useCelebrate debe usarse dentro de <CelebrateProvider>");
  return fire;
}

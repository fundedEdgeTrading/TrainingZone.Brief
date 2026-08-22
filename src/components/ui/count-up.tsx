"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cuenta de 0 a `value` con ease-out cúbico. `format` recibe el entero en curso
 * (p. ej. el helper `eur` del dashboard). Si el usuario pide reduced-motion, o
 * si el tween no llega a completar, se pinta el valor final: nunca se queda a 0.
 *
 * Todo el estado se mueve desde callbacks (rAF / timeout), nunca desde el
 * cuerpo del efecto: así el compilador de React no ve renders en cascada.
 */
export function CountUp({
  value,
  duration = 900,
  delay = 0,
  format = (n: number) => n.toLocaleString("es-ES"),
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduced = REDUCED();
    let start: number | null = null;
    const tick = (now: number) => {
      if (reduced) {
        setShown(value);
        return;
      }
      if (start === null) start = now;
      const p = Math.min(1, (now - start - delay) / duration);
      if (p < 0) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // Suelo de seguridad: si el rAF se pausa (pestaña en segundo plano) el
    // valor final se pinta igualmente.
    const floor = setTimeout(() => setShown(value), delay + duration + 250);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(floor);
    };
  }, [value, duration, delay]);

  return <span className="tz-nums">{format(shown)}</span>;
}

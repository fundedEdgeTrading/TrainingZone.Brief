"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const REDUCED = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cómo se pinta la cifra en curso.
 *
 * Es un descriptor de datos, no una función de formateo: `CountUp` lo recibe
 * desde Server Components (`KpiCard`) y una función no cruza esa frontera. Con
 * `divideBy: 100` y el estilo `currency` se reproduce el helper `eur` del panel
 * de control sin llevarse el helper al cliente.
 */
export type CountUpFormat = {
  /** Divisor previo al formateo: 100 para pasar de céntimos a euros. */
  divideBy?: number;
  /** Opciones de `Intl.NumberFormat`. Por defecto, entero en es-ES. */
  numberFormat?: Intl.NumberFormatOptions;
  /** Texto que sigue a la cifra (" años", "%"). */
  suffix?: string;
};

/**
 * Cuenta de 0 a `value` con ease-out cúbico. Si el usuario pide
 * reduced-motion, o si el tween no llega a completar, se pinta el valor final:
 * nunca se queda a 0.
 *
 * Todo el estado se mueve desde callbacks (rAF / timeout), nunca desde el
 * cuerpo del efecto: así el compilador de React no ve renders en cascada.
 */
export function CountUp({
  value,
  duration = 900,
  delay = 0,
  format,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: CountUpFormat;
}) {
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);

  const formatter = useMemo(
    () => new Intl.NumberFormat("es-ES", format?.numberFormat ?? { maximumFractionDigits: 0 }),
    [format?.numberFormat]
  );

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

  return (
    <span className="tz-nums">
      {formatter.format(shown / (format?.divideBy ?? 1))}
      {format?.suffix ?? ""}
    </span>
  );
}

/** Euros a partir de céntimos, igual que el helper `eur` del panel de control. */
export const EUR_FORMAT: CountUpFormat = {
  divideBy: 100,
  numberFormat: { style: "currency", currency: "EUR", maximumFractionDigits: 0 },
};

import { useEffect, useRef, useState } from "react";
import { AppState, Text, type StyleProp, type TextStyle } from "react-native";

export type CountdownFormat = "clock" | "mmss" | "compact";

function pad(value: number) {
  return String(Math.floor(value)).padStart(2, "0");
}

/** `hh:mm:ss` del héroe de "Mis sesiones" (con días plegados en horas). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}

/** `mm:ss` del "quedan" del panel del entrenador. */
export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${pad(s / 60)}:${pad(s % 60)}`;
}

/** Forma corta de las sesiones lejanas: `2 d 4 h`, `4 h 12 min`, `12 min`. */
export function formatCompact(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${Math.floor(s)} s`;
}

export function formatCountdown(seconds: number, format: CountdownFormat): string {
  if (format === "clock") return seconds >= 86400 ? formatCompact(seconds) : formatClock(seconds);
  if (format === "mmss") return seconds >= 3600 ? formatClock(seconds) : formatMmSs(seconds);
  return formatCompact(seconds);
}

/**
 * Segundos que faltan hasta `targetIso` (instante real) o hasta el instante
 * derivado de `initialSeconds` (valor calculado por el servidor). Al volver del
 * segundo plano se recalcula contra el reloj, así que la cuenta atrás nunca se
 * queda congelada ni acumula desfase (`AppState`).
 */
function initialTargetAt(targetIso?: string | null, initialSeconds?: number | null): number {
  if (targetIso) return Date.parse(targetIso);
  if (initialSeconds != null) return Date.now() + initialSeconds * 1000;
  return 0;
}

export function useCountdown(source: { targetIso?: string | null; initialSeconds?: number | null }): number {
  const { targetIso, initialSeconds } = source;
  const [targetAt, setTargetAt] = useState(() => initialTargetAt(targetIso, initialSeconds));
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.round((targetAt - Date.now()) / 1000)));

  // `targetAt` depende del reloj (Date.now()/Date.parse), así que no se puede
  // derivar puramente en el render: hace falta este efecto para
  // resincronizarlo cuando cambian las props.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    setTargetAt((prev) => {
      if (targetIso) return Date.parse(targetIso);
      if (prev === 0 && initialSeconds != null) return Date.now() + initialSeconds * 1000;
      return prev;
    });
  }, [targetIso, initialSeconds]);

  // Igual que arriba: el tic del contador depende del reloj real, no de props.
  useEffect(() => {
    const compute = () => Math.max(0, Math.round((targetAt - Date.now()) / 1000));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    setSeconds(compute());

    const interval = setInterval(() => setSeconds(compute()), 1000);
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") setSeconds(compute());
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [targetAt]);

  return seconds;
}

// Cuenta atrás en vivo (mismo propósito que src/app/(app)/trainer/session-countdown.tsx
// en web): el servidor da el instante o los segundos restantes y el cliente
// decrementa cada segundo contra su propio reloj.
export function Countdown({
  initialSeconds,
  targetIso,
  format = "compact",
  style,
  onFinish,
}: {
  initialSeconds?: number | null;
  targetIso?: string | null;
  format?: CountdownFormat;
  style?: StyleProp<TextStyle>;
  onFinish?: () => void;
}) {
  const seconds = useCountdown({ targetIso, initialSeconds });
  const fired = useRef(false);

  useEffect(() => {
    if (seconds === 0 && !fired.current) {
      fired.current = true;
      onFinish?.();
    }
    if (seconds > 0) fired.current = false;
  }, [seconds, onFinish]);

  return <Text style={style}>{formatCountdown(seconds, format)}</Text>;
}

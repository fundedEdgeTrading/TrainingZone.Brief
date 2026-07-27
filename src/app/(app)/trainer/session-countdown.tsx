"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Segundos restantes a "hh:mm:ss", con los días delante cuando los hay. */
export function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Cuenta atrás en vivo hasta un instante absoluto (ISO). El panel del
 * entrenador mostraba "en 412 min", un número congelado en el render del
 * servidor que además obligaba a hacer la cuenta mental.
 *
 * `initialSeconds` lo calcula el servidor para que el primer render coincida
 * con el del cliente (sin desajuste de hidratación); a partir del primer tick
 * manda el reloj del navegador, que es el que tiene delante el entrenador.
 */
export function SessionCountdown({
  targetIso,
  initialSeconds,
  className,
}: {
  targetIso: string;
  initialSeconds: number;
  className?: string;
}) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const router = useRouter();
  // Una sola recarga por objetivo: al llegar a cero el panel deja de ser válido
  // (la próxima sesión pasa a estar en curso), pero si el servidor devolviera lo
  // mismo no debe encadenar refrescos.
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && refreshedFor.current !== targetIso) {
        refreshedFor.current = targetIso;
        router.refresh();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso, router]);

  return (
    <time dateTime={targetIso} className={`tabular-nums ${className ?? ""}`} suppressHydrationWarning>
      {formatCountdown(remaining)}
    </time>
  );
}

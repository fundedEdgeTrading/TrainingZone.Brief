import { useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Cuenta atrás en vivo (mismo propósito que src/app/(app)/trainer/session-countdown.tsx
// en web): arranca en `initialSeconds` (calculado por el servidor) y decrementa cada
// segundo en el reloj del dispositivo, sin volver a pedir datos.
export function Countdown({ initialSeconds, style }: { initialSeconds: number; style?: StyleProp<TextStyle> }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
    const interval = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [initialSeconds]);

  return <Text style={style}>{formatCountdown(seconds)}</Text>;
}

import { useEffect, useState } from "react";
import { countUp, useReducedMotion } from "./motion";

/**
 * Recuento de una cifra desde 0 hasta su valor, 700 ms con ease-out cúbico.
 * Es para las cifras que RESUMEN algo —adherencia, sesiones del mes, saldo del
 * bono—: el recuento hace que la vista aterrice en el número en vez de
 * encontrárselo puesto, y es lo que justifica el `tabular-nums` que ya llevan
 * (sin él, el ancho de cada dígito bailaría mientras cuenta).
 *
 * No va con `Animated`: lo que cambia es TEXTO, y `Animated` solo interpola
 * estilos. De ahí el intervalo a 60 fps y el estado; son cuatro cifras por
 * pantalla, no una lista.
 *
 * Con «menos movimiento» activo el número sale directamente puesto.
 */
export function useCountUp(value: number, decimals = 0): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const from = 0;
    const started = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / countUp.duration);
      const k = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * k);
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [value, reduced]);

  // Con «menos movimiento» el valor se lee directo y el recuento ni arranca.
  return (reduced ? value : shown).toFixed(decimals);
}

/**
 * Parte un rótulo de cifra («85 %», «7.5») en el número que se puede contar y
 * el sufijo que lo acompaña. Devuelve `null` cuando no hay nada que contar, y
 * entonces el rótulo se pinta tal cual. Eso cubre dos casos distintos:
 *
 * - Lo que NO es un número: «–» (sin RPE registrado), «∞» (bono sin límite).
 *   Ahí lo que hay que leer es que no hay dato; un cero contando hasta nada
 *   diría lo contrario.
 * - Lo que lleva más dígitos DESPUÉS del primer número: un importe con
 *   separador de miles y céntimos («1.234,56 €») no se puede partir sin saber
 *   qué punto es separador decimal y cuál de millar, y a medio recuento saldría
 *   un importe falso. Se queda quieto, que es lo correcto para un importe.
 */
export function splitNumeric(text: string): { value: number; decimals: number; suffix: string } | null {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)(.*)$/.exec(text);
  if (!match) return null;
  const [, digits, suffix] = match;
  if (/\d/.test(suffix)) return null;
  const normalized = digits.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const dot = normalized.indexOf(".");
  return { value: parsed, decimals: dot === -1 ? 0 : normalized.length - dot - 1, suffix };
}

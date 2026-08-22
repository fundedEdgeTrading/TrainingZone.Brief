import { useEffect, useState } from "react";
import { AccessibilityInfo, Easing } from "react-native";

// Motion del handoff: 150-500 ms con `ease-out-soft` cubic-bezier(.2,.8,.2,1),
// y entrada escalonada de listas (máx. 6 elementos).
export const easeOutSoft = Easing.bezier(0.2, 0.8, 0.2, 1);
export const duration = { fast: 150, base: 250, slow: 380, slower: 500 } as const;

/** Delays de entrada del handoff, en orden; a partir del 6º elemento no se escalona. */
const STAGGER = [0, 60, 110, 160, 200, 240, 280];
export function stagger(index: number): number {
  return STAGGER[Math.min(index, STAGGER.length - 1)];
}

/**
 * `prefers-reduced-motion` del sistema: con él activo las animaciones de
 * entrada y los rebotes de botón se saltan (quedan en su estado final).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

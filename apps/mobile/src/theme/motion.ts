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

// ---------------------------------------------------------------------------
// Handoff de motion (transiciones y aparición). Los valores de duración, delay
// y easing son los del diseño y hay que respetarlos: lo que se afina aquí es
// la lectura de cada gesto, no el gusto de cada pantalla.
// ---------------------------------------------------------------------------

/** Curva de salida: para lo que se va (más seca que `easeOutSoft`). */
export const easeInOutSoft = Easing.bezier(0.4, 0, 0.2, 1);

/** Cambio de pestaña: crossfade, sin desplazamiento. */
export const tabFade = { out: 130, in: 220 } as const;

/** Pop del icono de la pestaña activa: 1 → 1.13 → 1. */
export const tabIconPop = { scale: 1.13, up: 120, down: 140 } as const;

/**
 * Push a detalle: entra desde la derecha, y la de atrás hace parallax
 * (`parallax`/`dim`) para que se lea como una capa que se queda debajo.
 *
 * Solo `in` llega a los sub-stacks: el stack NATIVO que usa Expo Router acepta
 * el nombre del preset y su duración, no una interpolación, así que el parallax
 * de la saliente no es configurable ahí —en iOS el push nativo ya trae el suyo,
 * en Android la saliente se queda quieta—. `parallax`, `dim`, `out` y `back`
 * quedan escritos como lo que pide el diseño: los recogería un cambio de los
 * seis sub-stacks al stack JS (`expo-router/js-stack`), que sí expone
 * `cardStyleInterpolator` a cambio de cambiar gestos y ciclo de vida de todas
 * esas pantallas —decisión que pide probarse en dispositivo—.
 */
export const push = { in: 300, out: 200, back: 260, parallax: -0.24, dim: 0.55 } as const;

/** Login → home: disolución con un pelo de escala. */
export const authEnter = { duration: 420, fromScale: 0.985 } as const;

/** Héroe / spotlight: entra un poco más largo que una tarjeta. */
export const heroEnter = { duration: 420, delay: 60, translateY: 12, fromScale: 0.985 } as const;

/** Recuento de cifras (KPI, saldos, porcentajes) y dibujado del anillo. */
export const countUp = { duration: 700, ringDelay: 120 } as const;

/** Barra de ocupación: crece desde la izquierda. */
export const barGrow = { duration: 520, delay: 240 } as const;

/** Salida del velo del mesociclo, una vez visto el 100 %. */
export const veilExit = { duration: 240 } as const;

/** Hoja (bottom sheet): sube con `easeOutSoft`, baja más seca con `easeInOutSoft`. */
export const sheetSlide = { in: 280, out: 180, scrimIn: 200, scrimOut: 160 } as const;

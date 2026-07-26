"use client";

import { useEffect, useRef } from "react";

/**
 * Arrastre unificado ratón + táctil sobre Pointer Events.
 *
 * El gesto no se activa al tocar: hace falta superar un umbral de movimiento
 * (ratón) o mantener pulsado `longPressMs` (táctil). Esa distinción es lo que
 * permite que en móvil un dedo que se desplaza siga haciendo scroll y solo
 * arrastre cuando el usuario mantiene pulsado primero.
 *
 * Mientras el arrastre está activo se bloquea el scroll con un listener
 * `touchmove` no pasivo — la única forma de cancelarlo en táctil, porque
 * `touch-action` tendría que estar puesto antes de empezar el gesto.
 */
export type DragPoint = { x: number; y: number };

export function usePointerDrag<T>(opts: {
  /** El gesto pasa a ser arrastre real (umbral superado o pulsación larga). */
  onActivate?: (data: T, p: DragPoint) => void;
  onMove?: (data: T, p: DragPoint) => void;
  /** `moved` distingue arrastre de tap/click simple. */
  onEnd?: (data: T, p: DragPoint, moved: boolean) => void;
  onCancel?: (data: T) => void;
  longPressMs?: number;
  threshold?: number;
}) {
  // Los listeners se montan una sola vez, así que leen las callbacks a través de
  // esta ref para no quedarse con las de la primera renderización.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const stateRef = useRef<{
    data: T;
    start: DragPoint;
    last: DragPoint;
    touch: boolean;
    active: boolean;
    timer: number | null;
  } | null>(null);

  useEffect(() => {
    function stop(p: DragPoint, cancelled: boolean) {
      const s = stateRef.current;
      if (!s) return;
      if (s.timer != null) window.clearTimeout(s.timer);
      stateRef.current = null;
      if (cancelled) optsRef.current.onCancel?.(s.data);
      else optsRef.current.onEnd?.(s.data, p, s.active);
    }

    function onPointerMove(e: PointerEvent) {
      const s = stateRef.current;
      if (!s) return;
      const p = { x: e.clientX, y: e.clientY };
      s.last = p;
      if (!s.active) {
        const dist = Math.abs(p.x - s.start.x) + Math.abs(p.y - s.start.y);
        if (dist <= (optsRef.current.threshold ?? 6)) return;
        // En táctil, moverse antes de la pulsación larga es scroll: se abandona
        // el gesto para no robarle el desplazamiento al usuario.
        if (s.touch) {
          stop(p, true);
          return;
        }
        s.active = true;
        optsRef.current.onActivate?.(s.data, p);
      }
      optsRef.current.onMove?.(s.data, p);
    }

    function onPointerUp(e: PointerEvent) {
      stop({ x: e.clientX, y: e.clientY }, false);
    }

    function onPointerCancel() {
      const s = stateRef.current;
      if (s) stop(s.last, true);
    }

    function onTouchMove(e: TouchEvent) {
      if (stateRef.current?.active) e.preventDefault();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return {
    start(e: React.PointerEvent, data: T) {
      const touch = e.pointerType !== "mouse";
      const start = { x: e.clientX, y: e.clientY };
      const prev = stateRef.current;
      if (prev?.timer != null) window.clearTimeout(prev.timer);
      const state = { data, start, last: start, touch, active: false, timer: null as number | null };
      stateRef.current = state;
      if (!touch) return;
      state.timer = window.setTimeout(() => {
        if (stateRef.current !== state) return;
        state.active = true;
        navigator.vibrate?.(12);
        optsRef.current.onActivate?.(data, state.last);
        optsRef.current.onMove?.(data, state.last);
      }, optsRef.current.longPressMs ?? 320);
    },
    /** True mientras el gesto ya cuenta como arrastre (para suprimir el click). */
    isDragging() {
      return stateRef.current?.active ?? false;
    },
  };
}

"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

export type PopoverSide = "top" | "bottom";

export type PopoverPosition = {
  left: number;
  width: number;
  maxHeight: number;
  side: PopoverSide;
  /** Volteada se ancla por `bottom` (ver regla 3). */
  top?: number;
  bottom?: number;
};

/** Alto máximo del panel: nunca ocupa más que el hueco libre en pantalla. */
export const POPOVER_MAX_HEIGHT = 300;
const POPOVER_GAP = 6;
/** Margen mínimo con los bordes del viewport (también evita la barra de gestos). */
const VIEWPORT_MARGIN = 10;

/**
 * Colocación de un panel flotante anclado a un disparador, pintado en un portal
 * a `document.body` con `position: fixed`. Dentro de un drawer, un modal o una
 * tabla con `overflow`, un popover `absolute` lo recorta el ancestro con scroll
 * (y de paso le añade barras de scroll a ese ancestro).
 *
 * Reglas (documentadas en el handoff del `Select` y reutilizadas por los
 * filtros de tabla):
 * 1. Abre hacia abajo. Solo se voltea si el alto REAL estimado de su contenido
 *    no cabe debajo y arriba hay más hueco — comparar contra el máximo fijo
 *    hacía que dentro de un drawer se volteara casi siempre.
 * 2. El lado se decide al abrir y no cambia mientras está abierto: en
 *    scroll/resize se recalculan las coordenadas con el mismo `side`
 *    (`place(true)`).
 * 3. Volteado se ancla por `bottom` al borde superior del disparador, no por un
 *    `top` calculado con la estimación: si el contenido real mide menos, el
 *    panel sigue pegado al disparador en vez de flotar por encima.
 * 4. Nunca se sale del viewport: ancho y coordenadas se recortan al margen.
 * 5. Por debajo de 640 px quien llama pinta una hoja inferior y no usa esto.
 */
export function usePopoverPosition({
  triggerRef,
  estimateHeight,
  minWidth = 260,
  width: fixedWidth,
  align = "left",
  maxHeight = POPOVER_MAX_HEIGHT,
}: {
  triggerRef: RefObject<HTMLElement | null>;
  /** Alto estimado del contenido, al alza a propósito (regla 1). */
  estimateHeight: number;
  /** Ancho mínimo cuando el ancho lo manda el disparador. */
  minWidth?: number;
  /** Ancho fijo: los paneles de filtro lo traen por eje. */
  width?: number;
  /** Borde por el que se alinea con el disparador. */
  align?: "left" | "right";
  maxHeight?: number;
}) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  /** Lado elegido al abrir: se conserva hasta cerrar (regla 2). */
  const sideRef = useRef<PopoverSide>("bottom");

  const place = useCallback(
    (keepSide: boolean) => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      const needed = Math.min(maxHeight, estimateHeight);
      const below = vh - rect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
      const above = rect.top - POPOVER_GAP - VIEWPORT_MARGIN;

      const side: PopoverSide = keepSide
        ? sideRef.current
        : below < needed && above > below
          ? "top"
          : "bottom";
      sideRef.current = side;

      const space = Math.max(140, side === "top" ? above : below);
      const boxHeight = Math.min(needed, space);
      const width = Math.min(fixedWidth ?? Math.max(rect.width, minWidth), vw - VIEWPORT_MARGIN * 2);
      const anchored = align === "right" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(VIEWPORT_MARGIN, anchored), vw - width - VIEWPORT_MARGIN);

      setPosition(
        side === "top"
          ? {
              side,
              left,
              width,
              maxHeight: boxHeight,
              bottom: Math.max(VIEWPORT_MARGIN, vh - rect.top + POPOVER_GAP),
            }
          : {
              side,
              left,
              width,
              maxHeight: boxHeight,
              top: Math.min(rect.bottom + POPOVER_GAP, vh - VIEWPORT_MARGIN - boxHeight),
            },
      );
    },
    [triggerRef, estimateHeight, minWidth, fixedWidth, align, maxHeight],
  );

  const reset = useCallback(() => setPosition(null), []);

  return { position, place, reset };
}

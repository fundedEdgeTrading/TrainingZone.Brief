"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Media query reactiva sin desajuste de hidratación: en el servidor devuelve
 * `serverValue` (por defecto `false`, es decir, "escritorio"), y tras hidratar
 * pasa al valor real de `matchMedia` y se resuscribe a sus cambios.
 *
 * Se usa cuando el layout no puede resolverse solo con clases de Tailwind
 * porque el propio comportamiento depende del tamaño (p. ej. la agenda pinta
 * un único día en móvil y la semana completa en escritorio, y la geometría del
 * arrastre necesita saber cuál de los dos está en pantalla).
 */
export function useMediaQuery(query: string, serverValue = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue
  );
}

/** `true` por debajo del breakpoint `lg` de Tailwind (1024px). */
export function useIsMobile() {
  return useMediaQuery("(max-width: 1023px)");
}

"use client";

import { usePathname } from "next/navigation";

/**
 * Barra de 3px al inicio del área de contenido. Se rearma sola en cada cambio
 * de pathname: el `key` remonta el nodo y la animación CSS vuelve a correr, así
 * que no hace falta ningún estado ni temporizador en JS. Complementa a
 * `loading.tsx`: la barra dice "vamos", el skeleton dice "esto va a aparecer".
 */
export function RouteProgress() {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="sticky top-0 left-0 right-0 h-[3px] z-40 bg-tz-linen/35 tz-route-bar-track"
      aria-hidden="true"
    >
      <div
        className="h-full origin-left"
        style={{
          background: "linear-gradient(90deg,var(--color-brand-ink) 0%,var(--color-apta-gold) 55%,var(--color-tz-sand) 100%)",
          animation: "tzRouteBar .62s var(--ease-out-soft) both",
        }}
      />
    </div>
  );
}

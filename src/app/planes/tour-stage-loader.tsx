"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";

// El `dynamic` con `ssr:false` tiene que vivir en un componente cliente, de ahí
// este loader intermedio.
const TourStage = dynamic(() => import("./tour-stage"), { ssr: false });

/**
 * E9-08 · El tutorial no entra en el primer bundle.
 *
 * `tour-screens.tsx` son 85.911 bytes de fuente y `tour-stage.tsx` otros 22 KB,
 * los dos colgando de un componente `"use client"` importado directamente desde
 * la página: ~108 KB de JavaScript que había que descargar, analizar y ejecutar
 * ANTES de que nadie pudiera pulsar "Ver planes". Es exactamente el bloque de
 * arriba de la página donde se decide la conversión.
 *
 * Se difiere por dos vías a la vez, y las dos hacen falta:
 *  · `ssr:false` — el árbol de la animación tampoco viaja en el HTML.
 *  · Intersección — el módulo no se pide hasta que la sección se acerca a la
 *    ventana, así que quien entra, mira el precio y se va no lo descarga nunca.
 *
 * El póster tiene EXACTAMENTE la misma caja que la pieza (`aspect-ratio`
 * 1920/1080 sobre el ancho completo, igual que `tour-stage`): cambiar trabajo de
 * arranque (TBT) por salto de maquetación (CLS) no sería una mejora, sería
 * mover el problema a la métrica de al lado.
 *
 * **Medición** (`next build` + suma de los `<script src>` que sirve `/planes`,
 * sin comprimir):
 *
 *     antes   672,6 KB en 12 scripts
 *     después 578,6 KB en 12 scripts   →  −94,0 KB (−14 %)
 *
 * Los dos trozos que desaparecen del arranque son los de la animación (73,9 KB
 * y 22,3 KB), que es justo lo que se buscaba: se siguen descargando, pero
 * cuando la sección se acerca y no antes de poder pulsar "Ver planes".
 */
export default function TourStageLoader({ core, premium }: { core: string[]; premium: string[] }) {
  const [visible, setVisible] = useState(false);

  const observe = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof IntersectionObserver === "undefined") {
      if (node) setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Con margen: se empieza a traer el módulo un poco antes de que la
      // sección asome, para que no se vea el póster durante la descarga.
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={observe} className="relative w-full" style={{ aspectRatio: "1920 / 1080" }}>
      {visible ? <TourStage core={core} premium={premium} /> : <TourPoster />}
    </div>
  );
}

/**
 * Póster: la silueta de la ventana de la app sobre el mismo fondo hueso con el
 * que arranca la pieza. Ocupa la caja entera, así que el relevo por la animación
 * no mueve un píxel.
 */
function TourPoster() {
  return (
    <div className="absolute inset-0 bg-tz-bone overflow-hidden" aria-hidden="true">
      <div className="absolute inset-[6%] rounded-[22px] bg-tz-sand border border-tz-linen shadow-[0_60px_120px_-40px_rgba(29,29,28,.25)]">
        <div className="flex items-center gap-[14px] px-[18px] h-11">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-[11px] h-[11px] rounded-full bg-brand-border-hover" />
          ))}
        </div>
        <div className="absolute inset-x-0 top-11 bottom-0 bg-brand-bg rounded-b-[21px] flex items-center justify-center">
          <span className="text-[13px] font-semibold text-brand-muted">Cargando el tutorial…</span>
        </div>
      </div>
    </div>
  );
}

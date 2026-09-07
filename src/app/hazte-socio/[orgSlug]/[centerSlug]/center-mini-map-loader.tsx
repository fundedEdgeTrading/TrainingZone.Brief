"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";

// Leaflet necesita DOM: solo cliente. Y el `dynamic` con `ssr:false` tiene que
// vivir en un componente cliente, de ahí este loader intermedio (mismo patrón
// que `barrio-map-loader.tsx`).
const CenterMiniMap = dynamic(() => import("./center-mini-map"), { ssr: false });

/**
 * E9-05 · El mapa se carga cuando entra en pantalla, no antes.
 *
 * Esta es la página donde se decide una conversión y el mapa vive al final, por
 * debajo del formulario y de los precios. Cargar Leaflet en el primer bundle
 * sería gastar el presupuesto de JavaScript de la página en el bloque que menos
 * gente llega a ver — el mismo razonamiento que E9-08 aplica al tour de
 * `/planes`.
 *
 * El hueco reservado tiene la altura definitiva desde el servidor (la fija el
 * contenedor de `center-nap.tsx`), así que montar el mapa no mueve nada: no se
 * cambia trabajo de arranque por salto de maquetación.
 */
export default function CenterMiniMapLoader({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const [visible, setVisible] = useState(false);

  // La observación se engancha desde una ref de callback y no desde un efecto:
  // así el observador nace con el nodo y muere con él, sin un render intermedio
  // en el que el elemento existe y nadie lo está mirando.
  const observe = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    // Sin IntersectionObserver (navegador antiguo, o entorno de prueba) se
    // monta directamente: degradar a "nunca aparece" sería peor.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={observe} className="absolute inset-0">
      {visible && <CenterMiniMap lat={lat} lng={lng} label={label} />}
    </div>
  );
}

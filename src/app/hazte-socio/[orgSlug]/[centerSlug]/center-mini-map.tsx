"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa mínimo de la ficha pública (E9-05): un punto, sin controles y sin
 * interacción.
 *
 * No es el mapa de barrios: aquí no hay nada que explorar, solo hay que ver
 * dónde cae el centro. Se desactivan arrastre, rueda y zoom táctil para que en
 * móvil el dedo siga desplazando la página en vez de quedarse atrapado dentro
 * del mapa — que es lo que hace que la gente abandone justo antes de pagar.
 * Debajo queda el enlace a OpenStreetMap para quien sí quiera navegarlo.
 */
export function CenterMiniMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const map = L.map(node, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({ className: "tz-ctr", html: '<span class="d"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    }).addTo(map);

    // El contenedor puede montarse todavía sin medidas: sin esto el mapa se
    // dibuja contra un 0×0 y sale gris.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(node);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [lat, lng]);

  return (
    <>
      <div ref={containerRef} className="tz-map absolute inset-0" role="img" aria-label={`Mapa con la ubicación de ${label}`} />
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
        target="_blank"
        rel="noreferrer"
        className="absolute right-2 top-2 z-[500] rounded-control bg-white/95 border border-brand-border px-2.5 py-1 text-[11px] font-semibold text-brand-text-2"
      >
        Cómo llegar
      </a>
    </>
  );
}

export default CenterMiniMap;

"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { INK } from "@/lib/chart-colors";

// Centro del mapa: sede principal de la demo (Training Zone, Madrid). Constante de
// configuración — en producción vendría de Organization/Center, no hardcodeada "mágica".
const CENTER_COORDS: [number, number] = [40.4168, -3.7038];
const DEFAULT_ZOOM = 6;
const MIN_BUBBLE_PX = 28;
const MAX_BUBBLE_PX = 62;

type PostalPoint = { code: string; lat: number; lng: number; name: string; leads: number; members: number; total: number };

export function PostalHeatmap({
  points,
  selectedCode,
  onSelectProvince,
}: {
  points: PostalPoint[];
  selectedCode?: string | null;
  onSelectProvince?: (code: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: L.Marker; point: PostalPoint }>>(new Map());
  // Ref con el callback siempre al día: así el efecto que crea los marcadores no
  // necesita depender de `onSelectProvince` y no los recrea (perdiendo la animación
  // de entrada) cada vez que cambia la selección desde la lista.
  const onSelectRef = useRef(onSelectProvince);
  onSelectRef.current = onSelectProvince;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: CENTER_COORDS,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    // El scroll normal de la página no debe quedar atrapado por el mapa: el zoom con
    // rueda solo se activa mientras el ratón está sobre el mapa (patrón habitual en
    // mapas embebidos dentro de una página con scroll).
    const enableScrollZoom = () => map.scrollWheelZoom.enable();
    const disableScrollZoom = () => map.scrollWheelZoom.disable();
    const el = containerRef.current;
    el.addEventListener("mouseenter", enableScrollZoom);
    el.addEventListener("mouseleave", disableScrollZoom);

    return () => {
      el.removeEventListener("mouseenter", enableScrollZoom);
      el.removeEventListener("mouseleave", disableScrollZoom);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Crea las burbujas de provincia. Depende solo de `points`, para que seleccionar
  // una fila de la lista (cambia `selectedCode`) no recree los marcadores ni
  // reinicie su animación de aparición.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const maxCount = Math.max(1, ...points.map((p) => p.total));
    const heatPoints: [number, number, number][] = points.map((p) => [p.lat, p.lng, p.total / maxCount]);

    // Gradiente dentro de la paleta de marca (beige→negro), sin colores por defecto de la librería.
    const heat = L.heatLayer(heatPoints, {
      radius: 32,
      blur: 22,
      maxZoom: 10,
      gradient: { 0.2: INK.baseline, 0.5: INK.muted, 0.8: INK.secondary, 1.0: INK.primary },
    }).addTo(map);

    markersRef.current.clear();
    const markers = points.map((p, i) => {
      const size = Math.round(MIN_BUBBLE_PX + (p.total / maxCount) * (MAX_BUBBLE_PX - MIN_BUBBLE_PX));
      const icon = L.divIcon({
        className: "tz-postal-marker",
        html: `<div class="tz-postal-bubble" style="animation-delay:${i * 35}ms;font-size:${Math.max(11, size * 0.34)}px">${p.total}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
      marker.bindTooltip(`<strong>${p.name}</strong><br/>${p.total} en total · ${p.members} socios · ${p.leads} leads`, {
        direction: "top",
        offset: [0, -size / 2],
      });
      marker.on("click", () => onSelectRef.current?.(p.code));
      markersRef.current.set(p.code, { marker, point: p });
      return marker;
    });

    return () => {
      heat.remove();
      markers.forEach((m) => m.remove());
      markersRef.current.clear();
    };
  }, [points]);

  // Vuela hasta la provincia seleccionada (desde un click en el mapa o en la lista) y
  // resalta su burbuja con un halo pulsante; la anterior vuelve a su estado normal.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(({ marker }, code) => {
      const el = marker.getElement()?.querySelector<HTMLDivElement>(".tz-postal-bubble");
      el?.classList.toggle("tz-postal-bubble--active", code === selectedCode);
    });

    if (selectedCode) {
      const entry = markersRef.current.get(selectedCode);
      if (entry) {
        map.flyTo([entry.point.lat, entry.point.lng], Math.max(map.getZoom(), 7), { duration: 0.9 });
      }
    }
  }, [selectedCode]);

  return <div ref={containerRef} className="w-full h-[380px] rounded-xl overflow-hidden" />;
}

export default PostalHeatmap;

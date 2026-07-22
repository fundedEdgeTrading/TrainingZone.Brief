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

export function PostalHeatmap({
  points,
}: {
  points: { lat: number; lng: number; name: string; count: number }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const maxCount = Math.max(1, ...points.map((p) => p.count));
    const heatPoints: [number, number, number][] = points.map((p) => [p.lat, p.lng, p.count / maxCount]);

    // Gradiente dentro de la paleta de marca (beige→negro), sin colores por defecto de la librería.
    const heat = L.heatLayer(heatPoints, {
      radius: 32,
      blur: 22,
      maxZoom: 10,
      gradient: { 0.2: INK.baseline, 0.5: INK.muted, 0.8: INK.secondary, 1.0: INK.primary },
    }).addTo(map);

    const markers = points.map((p) =>
      L.circleMarker([p.lat, p.lng], { radius: 3, color: INK.primary, weight: 1, fillOpacity: 0.6 })
        .bindTooltip(`${p.name}: ${p.count}`)
        .addTo(map)
    );

    return () => {
      heat.remove();
      markers.forEach((m) => m.remove());
    };
  }, [points]);

  return <div ref={containerRef} className="w-full h-[380px] rounded-xl overflow-hidden" />;
}

export default PostalHeatmap;

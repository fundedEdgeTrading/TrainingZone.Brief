"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

// Zaragoza capital (primera puesta en preproducción — ver postal-codes-zaragoza.ts):
// los barrios están a pocos km entre sí, así que el mapa arranca ya centrado y con
// zoom de ciudad en vez de la vista España-wide que tenía cuando agrupaba por
// provincia (con esa vista, todos los puntos quedaban fusionados en un único blob).
const HOME_CENTER: [number, number] = [41.6488, -0.8891];
const HOME_ZOOM = 12.3;
const SELECT_ZOOM = 14.5;
const MIN_BUBBLE_PX = 20;
const MAX_BUBBLE_PX = 64;

export type PostalPoint = { code: string; lat: number; lng: number; name: string; leads: number; members: number; total: number };
export type MapMetric = "all" | "leads" | "members";

function valueOf(p: PostalPoint, metric: MapMetric) {
  return metric === "leads" ? p.leads : metric === "members" ? p.members : p.total;
}

export function PostalHeatmap({
  points,
  metric,
  hoveredCode,
  onHoverProvince,
  onSelectProvince,
  flyToCode,
  resetSignal,
}: {
  points: PostalPoint[];
  metric: MapMetric;
  hoveredCode?: string | null;
  onHoverProvince?: (code: string | null) => void;
  onSelectProvince?: (code: string) => void;
  flyToCode?: string | null;
  /** Se incrementa desde el padre para pedir "Vista general" (flyTo al centro inicial). */
  resetSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.HeatLayer | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  // Refs con los callbacks siempre al día: así el efecto que construye capas no
  // necesita depender de ellos y no recrea las burbujas (perdiendo la animación
  // de entrada escalonada) en cada render.
  const onHoverRef = useRef(onHoverProvince);
  const onSelectRef = useRef(onSelectProvince);
  useEffect(() => {
    onHoverRef.current = onHoverProvince;
    onSelectRef.current = onSelectProvince;
  }, [onHoverProvince, onSelectProvince]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: HOME_CENTER,
      zoom: HOME_ZOOM,
      minZoom: 10,
      maxZoom: 17,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // El scroll normal de la página no debe quedar atrapado por el mapa: el zoom con
    // rueda solo se activa mientras el ratón está sobre el mapa.
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

  // Reconstruye capa de calor + burbujas cuando cambian los datos o la métrica
  // activa (Todos/Leads/Clientes): tamaños, opacidades y top-2 dependen de ella.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    groupRef.current?.remove();
    heatRef.current?.remove();

    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    const markers = new Map<string, L.Marker>();

    const maxV = Math.max(1, ...points.map((p) => valueOf(p, metric)));
    const heatPoints: [number, number, number][] = points.map((p) => [p.lat, p.lng, valueOf(p, metric) / maxV]);
    const heat = L.heatLayer(heatPoints, {
      radius: 34,
      blur: 26,
      maxZoom: HOME_ZOOM,
      minOpacity: 0.15,
      gradient: { 0.2: "#d8ccb8", 0.45: "#8a8574", 0.7: "#5b5748", 1.0: "#1d1d1c" },
    }).addTo(map);
    heatRef.current = heat;

    points.forEach((p, i) => {
      const v = valueOf(p, metric);
      const size = Math.round(MIN_BUBBLE_PX + Math.sqrt(v / maxV) * (MAX_BUBBLE_PX - MIN_BUBBLE_PX));
      const opacity = (0.45 + 0.5 * (v / maxV)).toFixed(2);
      const isTop = i < 2;
      const html = `<div class="tz-map-bubble${isTop ? " top" : ""}" style="width:${size}px;height:${size}px;--o:${opacity};animation-delay:${(i * 0.06).toFixed(2)}s;"><span class="tz-map-bubble-core"></span></div>`;
      const icon = L.divIcon({
        html,
        className: "tz-map-bubble-wrap",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([p.lat, p.lng], { icon, riseOnHover: true }).addTo(group);

      const tip = `
        <div style="padding:9px 12px;min-width:132px;">
          <div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:6px;">${p.name}</div>
          <div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;color:#c7bfad;"><span>Clientes</span><span style="font-weight:700;color:#f4f0e8;">${p.members}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;color:#c7bfad;margin-top:3px;"><span>Leads</span><span style="font-weight:700;color:#f4f0e8;">${p.leads}</span></div>
          <div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;margin-top:6px;padding-top:6px;border-top:1px solid #33322c;"><span style="color:#c8ab72;font-weight:600;">Total</span><span style="font-weight:800;color:#c8ab72;">${p.total}</span></div>
        </div>`;
      marker.bindTooltip(tip, { className: "tz-map-tip", direction: "top", offset: [0, -8], sticky: false });
      marker.on("mouseover", () => onHoverRef.current?.(p.code));
      marker.on("mouseout", () => onHoverRef.current?.(null));
      marker.on("click", () => onSelectRef.current?.(p.code));
      markers.set(p.code, marker);
    });

    markersRef.current = markers;

    return () => {
      group.remove();
      heat.remove();
      markers.clear();
    };
  }, [points, metric]);

  // Resalte sincronizado (mapa <-> lista): la provincia activa escala su
  // burbuja y abre su popover; las demás cierran el suyo.
  useEffect(() => {
    markersRef.current.forEach((marker, code) => {
      const el = marker.getElement()?.querySelector<HTMLDivElement>(".tz-map-bubble");
      el?.classList.toggle("tz-map-bubble-hi", code === hoveredCode);
      if (code !== hoveredCode) marker.closeTooltip();
    });
    if (hoveredCode) markersRef.current.get(hoveredCode)?.openTooltip();
  }, [hoveredCode]);

  // Click en burbuja o en fila del ranking: vuela hasta la provincia.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToCode) return;
    const point = points.find((p) => p.code === flyToCode);
    if (point) map.flyTo([point.lat, point.lng], SELECT_ZOOM, { duration: 0.9 });
  }, [flyToCode, points]);

  // "Vista general": vuelve al centro/zoom inicial cuando el padre pide un reset.
  const isFirstReset = useRef(true);
  useEffect(() => {
    if (isFirstReset.current) {
      isFirstReset.current = false;
      return;
    }
    mapRef.current?.flyTo(HOME_CENTER, HOME_ZOOM, { duration: 0.8 });
  }, [resetSignal]);

  return <div ref={containerRef} className="tz-map w-full h-[452px] bg-tz-sand" />;
}

export default PostalHeatmap;

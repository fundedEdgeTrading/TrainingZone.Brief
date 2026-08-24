"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

// La vista inicial se calcula de los propios puntos (ver homeBounds): con una sola
// ciudad encuadra sus barrios, y con varias — Zaragoza y Santander están a ~350 km —
// encuadra todas sin dejar puntos fuera. Antes era un centro/zoom fijo de Zaragoza,
// que con un segundo centro dejaba media organización fuera del encuadre.
const FALLBACK_CENTER: [number, number] = [40.4168, -3.7038];
const FALLBACK_ZOOM = 6;
const CITY_ZOOM = 12.3;
const SELECT_ZOOM = 14.5;
const MIN_BUBBLE_PX = 20;
const MAX_BUBBLE_PX = 64;

export type PostalPoint = { code: string; lat: number; lng: number; name: string; leads: number; members: number; total: number };
export type MapMetric = "all" | "leads" | "members";

const HOME_PADDING: [number, number] = [40, 40];

function valueOf(p: PostalPoint, metric: MapMetric) {
  return metric === "leads" ? p.leads : metric === "members" ? p.members : p.total;
}

/** Encuadre que contiene todos los barrios con datos, sea una ciudad o varias. */
function homeBounds(points: PostalPoint[]): L.LatLngBounds | null {
  if (points.length === 0) return null;
  return L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
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
  const hasFramed = useRef(false);
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
      center: FALLBACK_CENTER,
      zoom: FALLBACK_ZOOM,
      minZoom: 5,
      maxZoom: 17,
      scrollWheelZoom: false,
      // Arriba a la izquierda va ahora la tarjeta del barrio activo: el zoom se
      // baja a la esquina contraria en vez de quedar debajo de ella.
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
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

  // Las burbujas se construyen una sola vez por juego de puntos, con la caja
  // siempre a MAX_BUBBLE_PX: al cambiar de métrica no se desmontan y vuelven a
  // entrar, sino que su radio interpola (efecto aparte, más abajo). El ancla
  // del icono es constante, así que la burbuja no se mueve al cambiar de radio.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    groupRef.current?.remove();

    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    const markers = new Map<string, L.Marker>();

    points.forEach((p, i) => {
      const html = `<div class="tz-map-bubble" style="width:${MAX_BUBBLE_PX}px;height:${MAX_BUBBLE_PX}px;--s:0;--o:0;animation-delay:${(i * 0.06).toFixed(2)}s;"><span class="tz-map-bubble-core"></span></div>`;
      const icon = L.divIcon({
        html,
        className: "tz-map-bubble-wrap",
        iconSize: [MAX_BUBBLE_PX, MAX_BUBBLE_PX],
        iconAnchor: [MAX_BUBBLE_PX / 2, MAX_BUBBLE_PX / 2],
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

    // Primer encuadre: en cuanto hay puntos, ajusta la vista a todos ellos. `maxZoom`
    // evita que una sola ciudad con un único barrio se acerque hasta el nivel calle.
    if (!hasFramed.current) {
      const bounds = homeBounds(points);
      if (bounds) {
        map.fitBounds(bounds, { padding: HOME_PADDING, maxZoom: CITY_ZOOM });
        hasFramed.current = true;
      }
    }

    return () => {
      group.remove();
      markers.clear();
    };
  }, [points]);

  // Capa de calor y radios de burbuja dependen de la métrica activa
  // (Todos/Leads/Clientes). Aquí solo se actualizan valores sobre los nodos que
  // ya existen: el `transition: transform` de `.tz-map-bubble-core` interpola el
  // radio y los barrios sin datos en esa métrica se encogen hasta desaparecer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    heatRef.current?.remove();
    const maxV = Math.max(1, ...points.map((p) => valueOf(p, metric)));
    const heatPoints: [number, number, number][] = points.map((p) => [p.lat, p.lng, valueOf(p, metric) / maxV]);
    const heat = L.heatLayer(heatPoints, {
      radius: 34,
      blur: 26,
      maxZoom: CITY_ZOOM,
      minOpacity: 0.15,
      gradient: { 0.2: "#d8ccb8", 0.45: "#8a8574", 0.7: "#5b5748", 1.0: "#1d1d1c" },
    }).addTo(map);
    heatRef.current = heat;

    // El barrio de mayor volumen de la métrica activa, y solo ese, lleva el
    // dorado: el rediseño reserva el acento para "el dato que hay que mirar",
    // y con dos anillos dorados ya no había uno que mirar.
    const top = new Set(
      [...points]
        .filter((p) => valueOf(p, metric) > 0)
        .sort((a, b) => valueOf(b, metric) - valueOf(a, metric))
        .slice(0, 1)
        .map((p) => p.code)
    );

    const byCode = new Map(points.map((p) => [p.code, p]));
    markersRef.current.forEach((marker, code) => {
      const el = marker.getElement()?.querySelector<HTMLDivElement>(".tz-map-bubble");
      if (!el) return;
      const p = byCode.get(code);
      const v = p ? valueOf(p, metric) : 0;
      const size = v > 0 ? MIN_BUBBLE_PX + Math.sqrt(v / maxV) * (MAX_BUBBLE_PX - MIN_BUBBLE_PX) : 0;
      el.style.setProperty("--s", (size / MAX_BUBBLE_PX).toFixed(3));
      el.style.setProperty("--o", v > 0 ? (0.45 + 0.5 * (v / maxV)).toFixed(2) : "0");
      el.classList.toggle("top", top.has(code));
    });

    return () => {
      heat.remove();
    };
  }, [points, metric]);

  // Resalte sincronizado (mapa <-> lista): el barrio activo escala su burbuja,
  // gana el anillo dorado y abre su popover; los demás bajan de opacidad para
  // que el activo se lea sin buscarlo.
  useEffect(() => {
    markersRef.current.forEach((marker, code) => {
      const el = marker.getElement()?.querySelector<HTMLDivElement>(".tz-map-bubble");
      if (!el) return;
      el.classList.toggle("tz-map-bubble-hi", code === hoveredCode);
      el.classList.toggle("tz-map-bubble-dim", Boolean(hoveredCode) && code !== hoveredCode);
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

  // "Vista general": reencuadra todos los puntos cuando el padre pide un reset.
  const isFirstReset = useRef(true);
  useEffect(() => {
    if (isFirstReset.current) {
      isFirstReset.current = false;
      return;
    }
    const map = mapRef.current;
    const bounds = homeBounds(points);
    if (!map) return;
    if (bounds) map.flyToBounds(bounds, { padding: HOME_PADDING, maxZoom: CITY_ZOOM, duration: 0.8 });
    else map.flyTo(FALLBACK_CENTER, FALLBACK_ZOOM, { duration: 0.8 });
  }, [resetSignal, points]);

  return <div ref={containerRef} className="tz-map w-full h-[452px] bg-tz-sand" />;
}

export default PostalHeatmap;

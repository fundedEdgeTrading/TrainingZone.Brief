"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tessellate } from "@/lib/barrio-geometry";
import type { BarrioCenter, BarrioStat } from "@/lib/barrio-map";

/** Metros que se andan en un minuto (≈4,7 km/h): el radio del anillo de cada centro. */
const WALK_METERS_PER_MINUTE = 78;

/** Borde hueso entre celdas contiguas — es lo que separa un barrio del de al lado. */
const CELL_EDGE = "#f7f4ed";
const CELL_EDGE_ACTIVE = "#1d1d1c";
const RING_STROKE = "#8a8574";

export type BarrioMapProps = {
  /** Barrios de la ciudad activa; al cambiar de ciudad se reconstruye la geometría. */
  points: BarrioStat[];
  centers: BarrioCenter[];
  /** CP → color de relleno de la métrica activa (el mismo que su fila del ranking). */
  colors: Record<string, string>;
  /** CP → cifra ya formateada que acompaña al nombre en la etiqueta. */
  values: Record<string, string>;
  /** CP en orden de colocación de etiquetas: primero el de más peso en la métrica. */
  priority: string[];
  hovered: string | null;
  focus: string | null;
  showLabels: boolean;
  /** Se incrementa desde el padre para pedir «↺ Encuadrar». */
  frameSignal: number;
  /** Barrio al que volar; el contador permite repetir el vuelo al mismo barrio. */
  panTo: { code: string; signal: number } | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
  /** Minutos andando del anillo alrededor de cada centro. */
  walkMinutes?: number;
  showCenters?: boolean;
  /** Opacidad del relleno de las celdas; bájese para que se vea más callejero debajo. */
  cellOpacity?: number;
};

type Box = { l: number; r: number; t: number; b: number };

/**
 * Coropleta por barrio.
 *
 * Sustituye al `heatLayer` difuminado del panel: cada barrio es un polígono con
 * su borde, su nombre y su cifra, y la misma geometría se recolorea con seis
 * métricas distintas sin reconstruirse ni reencuadrarse.
 *
 * Leaflet vive fuera de React: la geometría se crea una vez por ciudad y los
 * cambios de métrica, foco o resalte solo tocan estilo sobre las capas que ya
 * existen (`setStyle`). El estado de React llega a los manejadores del mapa por
 * ref, para que un cambio de props no obligue a recrear polígonos.
 */
export function BarrioMap({
  points,
  centers,
  colors,
  values,
  priority,
  hovered,
  focus,
  showLabels,
  frameSignal,
  panTo,
  onHover,
  onSelect,
  walkMinutes = 15,
  showCenters = true,
  cellOpacity = 0.86,
}: BarrioMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Renderer propio y permanente: al vaciar las capas en un cambio de ciudad, el
  // renderer por defecto se desmonta y las geometrías nuevas se dibujan contra
  // unos límites aún sin calcular (salen con `d="M0 0"`).
  const rendererRef = useRef<L.SVG | null>(null);
  const cellsRef = useRef<L.LayerGroup | null>(null);
  const ringsRef = useRef<L.LayerGroup | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const polysRef = useRef(new Map<string, L.Polygon>());
  const labelMarkersRef = useRef(new Map<string, L.Marker>());
  const centerMarkersRef = useRef<L.Marker[]>([]);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  // Vista de arranque: el primer barrio de la ciudad, no una constante de
  // Zaragoza. Dura un instante —`frame()` encuadra la ciudad entera en cuanto
  // hay geometría—, pero una organización que solo esté en Santander no tiene
  // por qué asomarse primero al Ebro.
  const initialCenterRef = useRef<[number, number]>([points[0]?.lat ?? 40.4168, points[0]?.lng ?? -3.7038]);

  // Última foto de lo que pinta el mapa. Los manejadores de Leaflet y los
  // temporizadores viven fuera del ciclo de render: leen de aquí en vez de
  // capturar props de un render viejo.
  const viewRef = useRef({ colors, values, priority, hovered, focus, showLabels, cellOpacity });
  const handlersRef = useRef({ onHover, onSelect });
  useEffect(() => {
    viewRef.current = { colors, values, priority, hovered, focus, showLabels, cellOpacity };
    handlersRef.current = { onHover, onSelect };
  });

  /**
   * Etiquetas siempre visibles, pero sin apilarse: gana el barrio con más valor.
   * Se reejecuta en cada `zoomend`, `moveend` y repintado.
   */
  const layoutLabels = useCallback(() => {
    if (!mapRef.current) return;
    const { priority: order, hovered: hot, focus: pinned, showLabels: visible } = viewRef.current;

    const placed: Box[] = [];
    // Las tarjetas flotantes ocupan mapa: sus rectángulos entran en la lista de
    // colisiones para que ninguna etiqueta acabe enterrada debajo del cristal.
    document.querySelectorAll("[data-tz-overlay]").forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width && rect.height) {
        placed.push({ l: rect.left - 6, r: rect.right + 6, t: rect.top - 6, b: rect.bottom + 6 });
      }
    });
    centerMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      placed.push({ l: rect.left - 4, r: rect.right + 4, t: rect.top - 3, b: rect.bottom + 3 });
    });

    // La caja del `divIcon` mide 150 px aunque el rótulo ocupe 40: lo que choca
    // es la tinta (la unión de <b> e <i>), no la caja.
    const inkBox = (el: HTMLElement): Box => {
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let b = -Infinity;
      for (const child of Array.from(el.children)) {
        if (!child.getClientRects().length) continue;
        const rect = child.getBoundingClientRect();
        l = Math.min(l, rect.left);
        r = Math.max(r, rect.right);
        t = Math.min(t, rect.top);
        b = Math.max(b, rect.bottom);
      }
      return { l: l - 4, r: r + 4, t: t - 2, b: b + 2 };
    };
    const hits = (box: Box) => placed.some((q) => !(box.r < q.l || box.l > q.r || box.b < q.t || box.t > q.b));

    for (const code of order) {
      const el = labelMarkersRef.current.get(code)?.getElement();
      if (!el) continue;
      // Se oculta con clase, no con `style.display`: la regla base de `.tz-lbl`
      // es `display:flex !important` (hace falta para ganarle a Leaflet), y un
      // estilo en línea normal no puede con ella.
      if (!visible) {
        el.classList.add("off");
        continue;
      }
      el.classList.remove("off", "compact");
      let box = inkBox(el);
      // El barrio en foco o bajo el puntero no compite: siempre se ve.
      if (code !== hot && code !== pinned && hits(box)) {
        // No cabe el nombre: al menos la cifra, que es lo que el mapa mide.
        el.classList.add("compact");
        box = inkBox(el);
        if (hits(box)) {
          el.classList.add("off");
          continue;
        }
      }
      placed.push(box);
    }
  }, []);

  /** Encuadre de la ciudad, con hueco asimétrico para la columna derecha. */
  const frame = useCallback(() => {
    const map = mapRef.current;
    const bounds = boundsRef.current;
    if (!map || !bounds || !bounds.isValid()) return;
    map.stop();
    map.invalidateSize({ animate: false });
    const size = map.getSize();
    map.fitBounds(bounds, {
      animate: false,
      // Prioriza que los barrios se vean grandes: las etiquetas ya esquivan las
      // tarjetas, así que no hace falta reservarles el hueco entero.
      paddingTopLeft: [40, Math.min(96, size.y * 0.13)],
      paddingBottomRight: [Math.min(230, size.x * 0.2), Math.min(120, size.y * 0.16)],
    });
    window.setTimeout(layoutLabels, 60);
  }, [layoutLabels]);

  /** Recolorea celdas y etiquetas sin tocar la geometría. */
  const paint = useCallback(() => {
    const { colors: fill, hovered: hot, focus: pinned, cellOpacity: base } = viewRef.current;
    polysRef.current.forEach((layer, code) => {
      const active = code === hot || code === pinned;
      layer.setStyle({
        fillColor: fill[code],
        fillOpacity: active ? Math.min(1, base + 0.1) : base,
        color: active ? CELL_EDGE_ACTIVE : CELL_EDGE,
        weight: active ? 2.6 : 1.6,
      });
      if (active) layer.bringToFront();
      const el = labelMarkersRef.current.get(code)?.getElement();
      if (el) el.classList.toggle("hi", active);
    });
    layoutLabels();
  }, [layoutLabels]);

  // --- Ciclo de vida del mapa ------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: true,
      zoomSnap: 0.25,
      minZoom: 10,
      maxZoom: 17,
    });
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // `light_nolabels` (el panel usa `light_all`): los rótulos los pone la
    // vista, y los de CARTO competían con los nombres de barrio.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    rendererRef.current = L.svg({ padding: 0.6 });
    rendererRef.current.addTo(map);
    cellsRef.current = L.layerGroup().addTo(map);
    ringsRef.current = L.layerGroup().addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);

    map.on("zoomend moveend", layoutLabels);
    const onResize = () => frame();
    window.addEventListener("resize", onResize);
    // El contenedor todavía puede estar dimensionándose al montar: un segundo
    // encuadre cuando el layout ha cuajado evita quedarse con medio mapa fuera.
    const settle = window.setTimeout(() => {
      map.invalidateSize();
      frame();
    }, 140);

    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", onResize);
      map.off("zoomend moveend", layoutLabels);
      map.remove();
      mapRef.current = null;
      polysRef.current.clear();
      labelMarkersRef.current.clear();
      centerMarkersRef.current = [];
    };
  }, [frame, layoutLabels]);

  // Geometría: se reconstruye al cambiar de ciudad, nunca al cambiar de métrica.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { colors: fill, values: text, cellOpacity: base } = viewRef.current;

    const rings = tessellate(points);
    // El encuadre va ANTES de crear geometría: un `path` añadido mientras la
    // vista aún apunta a la otra ciudad se dibuja contra unos límites de
    // renderer que todavía no existen y sale vacío.
    boundsRef.current = rings.length ? L.latLngBounds(rings.flat()) : null;
    frame();

    cellsRef.current?.clearLayers();
    ringsRef.current?.clearLayers();
    labelsRef.current?.clearLayers();
    polysRef.current = new Map();
    labelMarkersRef.current = new Map();
    centerMarkersRef.current = [];

    points.forEach((point, i) => {
      const cell = L.polygon(rings[i], {
        renderer: rendererRef.current ?? undefined,
        color: CELL_EDGE,
        weight: 1.6,
        opacity: 1,
        fillColor: fill[point.code],
        fillOpacity: base,
      });
      cell.on("mouseover", () => handlersRef.current.onHover(point.code));
      cell.on("mouseout", () => handlersRef.current.onHover(null));
      cell.on("click", () => handlersRef.current.onSelect(point.code));
      cellsRef.current?.addLayer(cell);
      polysRef.current.set(point.code, cell);

      const label = L.marker([point.lat, point.lng], {
        interactive: false,
        icon: L.divIcon({
          className: "tz-lbl",
          html: `<b>${escapeHtml(point.name)}</b><i>${escapeHtml(text[point.code] ?? "")}</i>`,
          iconSize: [150, 30],
          iconAnchor: [75, 15],
        }),
      });
      labelsRef.current?.addLayer(label);
      labelMarkersRef.current.set(point.code, label);
    });

    if (showCenters) {
      centers.forEach((center) => {
        const ring = L.circle([center.lat, center.lng], {
          renderer: rendererRef.current ?? undefined,
          radius: walkMinutes * WALK_METERS_PER_MINUTE,
          color: RING_STROKE,
          weight: 1.4,
          dashArray: "4 5",
          opacity: 0.75,
          fill: false,
        });
        ringsRef.current?.addLayer(ring);
        const marker = L.marker([center.lat, center.lng], {
          interactive: false,
          zIndexOffset: 800,
          icon: L.divIcon({
            className: "tz-ctr",
            html: `<span class="d"></span><span class="t">${escapeHtml(center.name)}</span>`,
            iconSize: [160, 16],
            iconAnchor: [6, 8],
          }),
        });
        ringsRef.current?.addLayer(marker);
        centerMarkersRef.current.push(marker);
      });
    }

    paint();
    // El juego de puntos y de centros cambia con la ciudad: es lo que dispara la
    // reconstrucción, junto a los parámetros que redibujan los anillos.
  }, [points, centers, showCenters, walkMinutes, frame, paint]);

  // Cambio de métrica, resalte o foco: solo relleno, sin tocar geometría.
  useEffect(() => {
    paint();
  }, [colors, values, hovered, focus, cellOpacity, paint]);

  // Las etiquetas también se recolocan al ocultarlas/enseñarlas y al reordenar
  // la prioridad (cambia con la métrica).
  useEffect(() => {
    const { values: text } = viewRef.current;
    labelMarkersRef.current.forEach((marker, code) => {
      const el = marker.getElement();
      const value = el?.querySelector("i");
      if (value) value.textContent = text[code] ?? "";
    });
    layoutLabels();
  }, [showLabels, priority, values, layoutLabels]);

  // «↺ Encuadrar». El primer disparo lo hace ya el montaje.
  const framedOnce = useRef(false);
  useEffect(() => {
    if (!framedOnce.current) {
      framedOnce.current = true;
      return;
    }
    frame();
  }, [frameSignal, frame]);

  // Clic en celda o en fila del ranking: vuelo corto hasta el barrio.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panTo) return;
    const point = points.find((p) => p.code === panTo.code);
    if (point) map.panTo([point.lat, point.lng], { duration: 0.6 });
  }, [panTo, points]);

  return <div ref={containerRef} className="tz-map tz-barrio-map absolute inset-0 bg-tz-sand" />;
}

/** Los nombres de barrio y de centro entran en `innerHTML` del `divIcon`. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default BarrioMap;

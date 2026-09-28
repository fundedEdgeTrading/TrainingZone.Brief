"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tessellate, type Ring } from "@/lib/barrio-geometry";
import { coversCity, ringsFromTopology } from "@/lib/barrio-geojson";
import { POSTAL_GEOMETRY_ATTRIBUTION } from "@/lib/barrio-coverage";
import { CARTO_ATTRIBUTION, cartoTileUrl } from "@/lib/basemap";
import { centerPinIcon } from "@/lib/map-pin";
import {
  INK_DARK,
  NO_ACTIVITY_FILL,
  NO_DATA_FILL,
  haloForInk,
  type BarrioCenter,
  type BarrioStat,
} from "@/lib/barrio-map";

/** Metros que se andan en un minuto (≈4,7 km/h): el radio del anillo de cada centro. */
const WALK_METERS_PER_MINUTE = 78;

/**
 * Borde blanco y fino entre celdas contiguas. El hueso grueso de antes (1,6 px)
 * dibujaba una rejilla que competía con el color; el blanco fino separa sin
 * dibujar.
 */
const CELL_EDGE = "#ffffff";
const CELL_EDGE_ACTIVE = "#1d1d1c";
const CELL_WEIGHT = 1;
const CELL_WEIGHT_ACTIVE = 2.4;

/** Opacidad de un barrio sin actividad: se ve la ciudad, no un color. */
const EMPTY_OPACITY = 0.1;
/** Con un barrio en foco, el resto se aparta: el acento solo funciona si lo demás no compite. */
const DIM_FACTOR = 0.55;

/** Trazo de los barrios con valor negativo (E11-06). */
const NEGATIVE_DASH = "3 3";

/** Tinta del anillo de «N min andando» y de la máscara exterior. */
const RING_INK = "#1d1d1c";

/**
 * Cuántos barrios llevan nombre además de cifra. El resto, solo la cifra: con
 * los diecinueve nombres a la vez el plano era una sopa de letras y el color,
 * que es lo que mide, quedaba debajo.
 */
const NAMED_LABELS = 7;

/**
 * Zoom a partir del cual se enseñan los rótulos de calle de CARTO. Al encuadrar
 * la ciudad (zoom ≈12-13) competirían con los nombres de barrio, que son los
 * que importan; al acercarse a un barrio, las calles son lo que orienta.
 */
const STREET_LABELS_ZOOM = 14;


/**
 * E11-10 · `prefers-reduced-motion`, de verdad.
 *
 * El bloque de `globals.css` anula las animaciones **CSS**, pero `panTo` y
 * `flyTo` son animación JS de Leaflet: se seguían ejecutando enteras. Para quien
 * marca esa preferencia porque el movimiento le marea, el mapa era justo lo que
 * había pedido que no pasara.
 *
 * Se consulta en cada uso y no una vez al montar: la preferencia se puede
 * cambiar con la pestaña abierta.
 */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * E11-10 · En táctil, `mouseover` dispara al tocar y `mouseout` **no llega
 * nunca**: el barrio se quedaba señalado indefinidamente, y el siguiente toque
 * en otro sitio dejaba dos señalados a la vez. Con puntero grueso se usa solo
 * `click`.
 */
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

export type BarrioMapProps = {
  /** Barrios de la ciudad activa; al cambiar de ciudad se reconstruye la geometría. */
  points: BarrioStat[];
  centers: BarrioCenter[];
  /** CP → color de relleno de la métrica activa (el mismo que su fila del ranking). */
  colors: Record<string, string>;
  /** CP → tinta del rótulo, elegida por contraste contra ese relleno (E11-06). */
  inks: Record<string, string>;
  /** CP → `true` si el valor es negativo: trazo discontinuo como redundancia no cromática (E11-06). */
  dashed: Record<string, boolean>;
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
  /** Clave de la ciudad activa: es la que se pide a `/api/geo/[ciudad]` (E11-08). */
  cityKey: string;
  /** Acercar (+1) o alejar (−1); el contador permite repetir. Los botones viven en la botonera de la vista. */
  zoomSignal?: { dir: 1 | -1; signal: number } | null;
  /**
   * Zoom con la rueda. A pantalla completa, sí; dentro de una tarjeta del panel,
   * no: la rueda es el scroll de la página, y un mapa que se la queda atrapa a
   * quien solo quería bajar.
   */
  scrollZoom?: boolean;
  /** Nombre accesible del mapa; por defecto, el de la pantalla del mapa de barrios. */
  ariaLabel?: string;
  /**
   * Cómo se reserva hueco al encuadrar. `screen` (pantalla completa) mide el
   * panel, la columna de controles y la leyenda y encuadra en lo que queda;
   * `card` (tarjeta del panel) deja un margen fijo y corto: ahí los overlays
   * son pequeños y reservarles su alto entero dejaba la ciudad en un sello.
   */
  fit?: "screen" | "card";
  /** Avisa de qué geometría se está pintando, para que la leyenda no mienta (E11-08). */
  onGeometry?: (realGeometry: boolean) => void;
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
  inks,
  dashed,
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
  cellOpacity = 0.74,
  cityKey,
  zoomSignal = null,
  scrollZoom = true,
  ariaLabel,
  fit = "screen",
  onGeometry,
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
  const maskRef = useRef<L.Polygon | null>(null);
  const polysRef = useRef(new Map<string, L.Polygon>());
  const labelMarkersRef = useRef(new Map<string, L.Marker>());
  const centerMarkersRef = useRef<L.Marker[]>([]);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  // Vista de arranque: el primer barrio de la ciudad, no una constante de
  // Zaragoza. Dura un instante —`frame()` encuadra la ciudad entera en cuanto
  // hay geometría—, pero una organización que solo esté en Santander no tiene
  // por qué asomarse primero al Ebro.
  const initialCenterRef = useRef<[number, number]>([points[0]?.lat ?? 40.4168, points[0]?.lng ?? -3.7038]);
  // Solo se lee al montar: cambiar de opinión con el mapa vivo no está previsto.
  const scrollZoomRef = useRef(scrollZoom);
  const fitRef = useRef(fit);

  /**
   * E11-08 · Los contornos reales de la ciudad activa, si están publicados.
   *
   * `null` mientras se piden y cuando no los hay: en los dos casos se pinta la
   * teselación, así que el mapa nunca se queda en blanco esperando una descarga.
   * Se pide SOLO la ciudad que se está mirando — servir el país entero para
   * pintar Zaragoza sería mandar noventa y nueve ciudades que nadie va a ver.
   */
  const [geo, setGeo] = useState<{ city: string; byCode: Record<string, Ring> } | null>(null);
  // La geometría lleva pegada la ciudad para la que se descargó: así, al cambiar
  // de ciudad, el valor viejo deja de aplicar SOLO y no hace falta ponerlo a
  // null desde el efecto (que además sería un repintado en cascada).
  const realRings = geo?.city === cityKey ? geo.byCode : null;

  // Última foto de lo que pinta el mapa. Los manejadores de Leaflet y los
  // temporizadores viven fuera del ciclo de render: leen de aquí en vez de
  // capturar props de un render viejo.
  const viewRef = useRef({ colors, inks, dashed, values, priority, hovered, focus, showLabels, cellOpacity });
  const handlersRef = useRef({ onHover, onSelect });
  useEffect(() => {
    viewRef.current = { colors, inks, dashed, values, priority, hovered, focus, showLabels, cellOpacity };
    handlersRef.current = { onHover, onSelect };
  });

  /**
   * Etiquetas siempre visibles, pero sin apilarse: gana el barrio con más valor.
   * Se reejecuta en cada `zoomend`, `moveend` y repintado.
   */
  const layoutLabels = useCallback(() => {
    if (!mapRef.current) return;
    const { priority: order, hovered: hot, focus: pinned, showLabels: visible, colors: fill } = viewRef.current;

    const placed: Box[] = [];
    // Las tarjetas flotantes ocupan mapa: sus rectángulos entran en la lista de
    // colisiones para que ninguna etiqueta acabe enterrada debajo del cristal.
    document.querySelectorAll("[data-tz-overlay]").forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width && rect.height) {
        placed.push({ l: rect.left - 6, r: rect.right + 6, t: rect.top - 6, b: rect.bottom + 6 });
      }
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
    // El marcador del centro y su rótulo, que sale de la caja del icono: se
    // mide la tinta, igual que en las etiquetas.
    centerMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) placed.push(inkBox(el));
    });
    const hits = (box: Box) => placed.some((q) => !(box.r < q.l || box.l > q.r || box.b < q.t || box.t > q.b));

    let named = 0;
    for (const code of order) {
      const el = labelMarkersRef.current.get(code)?.getElement();
      if (!el) continue;
      const lit = code === hot || code === pinned;
      // Un barrio sin actividad (o sin dato) no lleva rótulo salvo que se le
      // señale: diecinueve ceros repartidos por el plano no dicen nada.
      const quiet = fill[code] === NO_ACTIVITY_FILL || fill[code] === NO_DATA_FILL;
      if (quiet && !lit) {
        el.classList.add("off");
        continue;
      }
      // Se oculta con clase, no con `style.display`: la regla base de `.tz-lbl`
      // es `display:flex !important` (hace falta para ganarle a Leaflet), y un
      // estilo en línea normal no puede con ella.
      if (!visible) {
        el.classList.add("off");
        continue;
      }
      el.classList.remove("off", "compact");
      // Nombre solo en los que más pesan; los demás, la cifra.
      if (!lit && named >= NAMED_LABELS) el.classList.add("compact");
      let box = inkBox(el);
      // El barrio en foco o bajo el puntero no compite: siempre se ve.
      if (!lit && hits(box)) {
        // No cabe el nombre: al menos la cifra, que es lo que el mapa mide.
        el.classList.add("compact");
        box = inkBox(el);
        if (hits(box)) {
          el.classList.add("off");
          continue;
        }
      }
      if (!el.classList.contains("compact")) named++;
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
    // Contenedor todavía sin medidas (el layout aún no ha cuajado): encuadrar
    // aquí daría un zoom NaN y dejaría las geometrías sin dibujar. Se deja para
    // cuando el `ResizeObserver` avise de que ya ocupa algo.
    if (size.x === 0 || size.y === 0) return;
    if (fitRef.current === "card") {
      map.fitBounds(bounds, { animate: false, paddingTopLeft: [16, 44], paddingBottomRight: [16, 36] });
      window.setTimeout(layoutLabels, 60);
      return;
    }
    // El hueco libre se mide, no se supone: el panel es columna derecha en
    // escritorio y hoja inferior en móvil, y la columna de controles crece o
    // encoge con los filtros. Se encuadra la ciudad en lo que queda.
    const box = map.getContainer().getBoundingClientRect();
    let top = Math.min(96, size.y * 0.13);
    let right = Math.min(230, size.x * 0.2);
    let bottom = Math.min(120, size.y * 0.16);
    const panel = document.querySelector<HTMLElement>("[data-tz-panel]");
    const panelRect = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    if (panelRect && panelRect.width && panelRect.height) {
      if (panelRect.left > box.left + box.width / 2) right = Math.max(right, box.right - panelRect.left + 16);
      else bottom = Math.max(bottom, box.bottom - panelRect.top + 12);
    }
    const controls = document.querySelector<HTMLElement>("[data-tz-controls]")?.getBoundingClientRect();
    if (controls && controls.height) top = Math.max(top, controls.bottom - box.top + 8);
    // La leyenda, cuando va abajo (escritorio), también se reserva.
    const legend = document.querySelector<HTMLElement>("[data-tz-legend]")?.getBoundingClientRect();
    if (legend && legend.height && legend.top > box.top + box.height / 2) {
      bottom = Math.max(bottom, box.bottom - legend.top + 8);
    }
    // Nunca más de media pantalla por lado: el mapa tiene que seguir siendo mapa.
    top = Math.min(top, size.y * 0.45);
    bottom = Math.min(bottom, size.y * 0.45);
    right = Math.min(right, size.x * 0.5);
    map.fitBounds(bounds, {
      animate: false,
      // Prioriza que los barrios se vean grandes: las etiquetas ya esquivan las
      // tarjetas, así que no hace falta reservarles el hueco entero.
      paddingTopLeft: [24, top],
      paddingBottomRight: [right, bottom],
    });
    window.setTimeout(layoutLabels, 60);
  }, [layoutLabels]);

  /** Recolorea celdas y etiquetas sin tocar la geometría. */
  const paint = useCallback(() => {
    const { colors: fill, inks: ink, dashed: dash, hovered: hot, focus: pinned, cellOpacity: base } = viewRef.current;
    const anyActive = Boolean(hot || pinned);
    polysRef.current.forEach((layer, code) => {
      const active = code === hot || code === pinned;
      const empty = fill[code] === NO_ACTIVITY_FILL;
      const own = empty ? EMPTY_OPACITY : base;
      layer.setStyle({
        fillColor: fill[code],
        fillOpacity: active ? Math.min(1, Math.max(own, base) + 0.12) : anyActive ? own * DIM_FACTOR : own,
        color: active ? CELL_EDGE_ACTIVE : CELL_EDGE,
        opacity: active ? 1 : 0.9,
        weight: active ? CELL_WEIGHT_ACTIVE : CELL_WEIGHT,
        // E11-06 · Redundancia no cromática: los barrios que CAEN llevan borde
        // discontinuo. La claridad de la rampa ya lleva el signo; esto lo dice
        // además sin depender de ver ningún color.
        dashArray: dash[code] ? NEGATIVE_DASH : undefined,
      });
      if (active) layer.bringToFront();
      // La sombra del barrio activo va por CSS: lo levanta del plano.
      layer.getElement()?.classList.toggle("tz-cell-on", active);
      // El globo enseña la métrica ACTIVA: si no se actualizara aquí, seguiría
      // contando la anterior.
      const point = points.find((p) => p.code === code);
      if (point) layer.setTooltipContent(tooltipHtml(point.name, viewRef.current.values[code] ?? ""));
      const el = labelMarkersRef.current.get(code)?.getElement();
      if (el) {
        el.classList.toggle("hi", active);
        // La tinta del rótulo se elige por contraste contra su propia celda: con
        // tinta fija, sobre el escalón más oscuro la cifra daba 1,12:1.
        el.style.setProperty("--tz-lbl-ink", ink[code] ?? INK_DARK);
        el.style.setProperty("--tz-lbl-halo", haloForInk(ink[code] ?? INK_DARK));
      }
    });
    layoutLabels();
  }, [layoutLabels, points]);

  // --- Ciclo de vida del mapa ------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: scrollZoomRef.current,
      zoomSnap: 0.25,
      minZoom: 10,
      maxZoom: 17,
    });
    mapRef.current = map;
    // Sin control de zoom de Leaflet: sus botones caían encima del ranking. El
    // +/− vive en la botonera de la vista, junto a «Encuadrar» (`zoomSignal`).

    // `light_nolabels` (el panel usa `light_all`): los rótulos de barrio los
    // pone la vista, y los de CARTO competían con ellos.
    L.tileLayer(cartoTileUrl("light_nolabels"), {
      attribution: CARTO_ATTRIBUTION,
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Los rótulos de calle, en su propio panel POR ENCIMA de las celdas (z 450:
    // sobre los polígonos, por debajo de las etiquetas de barrio) y solo a zoom
    // de calle. Con la ciudad entera en pantalla no se piden ni se pintan.
    map.createPane("tz-street-labels");
    const streetPane = map.getPane("tz-street-labels");
    if (streetPane) {
      streetPane.style.zIndex = "450";
      streetPane.style.pointerEvents = "none";
    }
    const streetLabels = L.tileLayer(cartoTileUrl("light_only_labels"), {
      pane: "tz-street-labels",
      subdomains: "abcd",
      maxZoom: 19,
      opacity: 0.85,
    });
    const syncStreetLabels = () => {
      const want = map.getZoom() >= STREET_LABELS_ZOOM;
      if (want && !map.hasLayer(streetLabels)) streetLabels.addTo(map);
      if (!want && map.hasLayer(streetLabels)) streetLabels.remove();
    };
    map.on("zoomend", syncStreetLabels);

    rendererRef.current = L.svg({ padding: 0.6 });
    rendererRef.current.addTo(map);
    cellsRef.current = L.layerGroup().addTo(map);
    ringsRef.current = L.layerGroup().addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);

    map.on("zoomend moveend", layoutLabels);
    // `ResizeObserver` y no `resize` de ventana: el contenedor cambia de tamaño
    // también sin que lo haga la ventana (al plegar el sidebar), y —lo que
    // importa aquí— puede estar todavía a 0×0 cuando el mapa se monta en una
    // navegación de cliente. Su primer aviso con medidas reales es el que
    // encuadra la ciudad.
    const observer = new ResizeObserver(() => frame());
    observer.observe(containerRef.current);
    // Red de seguridad para navegadores que no avisen: un segundo encuadre
    // cuando el layout ya ha cuajado.
    const settle = window.setTimeout(() => {
      map.invalidateSize();
      frame();
    }, 140);

    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
      map.off("zoomend moveend", layoutLabels);
      map.off("zoomend", syncStreetLabels);
      map.remove();
      mapRef.current = null;
      polysRef.current.clear();
      labelMarkersRef.current.clear();
      centerMarkersRef.current = [];
    };
  }, [frame, layoutLabels]);

  // E11-08 · Descarga de la geometría publicada. Un 404 es un estado normal
  // ("esta ciudad no la tiene"), no una avería: se cae a la teselación.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/geo/${encodeURIComponent(cityKey)}`);
        if (!response.ok) return;
        const rings = ringsFromTopology(await response.json());
        // Media ciudad con contorno real y media con teselación es peor que la
        // ciudad entera aproximada: o cubre todos los barrios, o no se usa.
        if (!cancelled && coversCity(rings, points.map((p) => p.code))) {
          setGeo({ city: cityKey, byCode: rings.byCode });
        }
      } catch {
        // Sin red, o JSON corrupto: la teselación sigue ahí.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cityKey, points]);

  // Geometría: se reconstruye al cambiar de ciudad, nunca al cambiar de métrica.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { colors: fill, values: text, cellOpacity: base } = viewRef.current;

    /**
     * E11-08 · `topojson-client` sustituye a `tessellate()` cuando hay
     * geometría. La vista ya trabajaba sobre anillos, así que color, etiquetas,
     * foco y encuadre no se enteran de cuál es cuál — y con contornos publicados
     * desaparece de golpe el acantilado de `tessellate()`, que es O(n²) y
     * síncrono en el hilo principal.
     */
    const rings = realRings ? points.map((p) => realRings[p.code]) : tessellate(points);
    onGeometry?.(realRings !== null);
    // El encuadre va ANTES de crear geometría: un `path` añadido mientras la
    // vista aún apunta a la otra ciudad se dibuja contra unos límites de
    // renderer que todavía no existen y sale vacío.
    // Con contornos oficiales se encuadra sobre los CENTROIDES y no sobre los
    // contornos: los CP periurbanos (50011, 50012) llevan término rural y
    // encuadrarlos entero dejaba la ciudad en un sello en mitad de la pantalla.
    boundsRef.current = !rings.length
      ? null
      : realRings
        ? L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.22)
        : L.latLngBounds(rings.flat());
    frame();

    // La fuente de los contornos oficiales se cita en el propio mapa (CC BY 4.0).
    if (realRings) map.attributionControl.addAttribution(POSTAL_GEOMETRY_ATTRIBUTION);
    else map.attributionControl.removeAttribution(POSTAL_GEOMETRY_ATTRIBUTION);

    cellsRef.current?.clearLayers();
    ringsRef.current?.clearLayers();
    labelsRef.current?.clearLayers();
    polysRef.current = new Map();
    labelMarkersRef.current = new Map();
    centerMarkersRef.current = [];

    // Máscara: todo lo que queda FUERA de la ciudad se apaga, para que la
    // ciudad tenga forma y el ojo no se vaya al callejero de alrededor. Es un
    // rectángulo grande con un agujero por barrio (regla par-impar de SVG): no
    // hace falta calcular la unión de los contornos.
    if (rings.length) {
      const outer = boundsRef.current ?? L.latLngBounds(rings.flat());
      const c = outer.getCenter();
      const frameRing: Ring = [
        [c.lat - 2, c.lng - 3],
        [c.lat - 2, c.lng + 3],
        [c.lat + 2, c.lng + 3],
        [c.lat + 2, c.lng - 3],
      ];
      maskRef.current = L.polygon([frameRing, ...rings], {
        renderer: rendererRef.current ?? undefined,
        interactive: false,
        stroke: false,
        fillColor: RING_INK,
        fillOpacity: 0.05,
        className: "tz-mask",
      });
      cellsRef.current?.addLayer(maskRef.current);
    }

    points.forEach((point, i) => {
      const empty = fill[point.code] === NO_ACTIVITY_FILL;
      const cell = L.polygon(rings[i], {
        renderer: rendererRef.current ?? undefined,
        color: CELL_EDGE,
        weight: CELL_WEIGHT,
        opacity: 0.9,
        fillColor: fill[point.code],
        fillOpacity: empty ? EMPTY_OPACITY : base,
      });
      // En táctil no se cuelgan los manejadores de ratón: `mouseout` no llega
      // nunca y el barrio se queda señalado para siempre.
      if (!isCoarsePointer()) {
        cell.on("mouseover", () => handlersRef.current.onHover(point.code));
        cell.on("mouseout", () => handlersRef.current.onHover(null));
      }
      cell.on("click", () => handlersRef.current.onSelect(point.code));

      // E11-10 · El polígono cuenta lo suyo sin depender de la tarjeta de foco,
      // que bajo 1024 px no está. `sticky:false` para que el globo no persiga al
      // dedo en táctil.
      cell.bindTooltip(tooltipHtml(point.name, text[point.code] ?? ""), {
        className: "tz-map-tip tz-cell-tip",
        direction: "top",
        sticky: false,
        opacity: 1,
      });
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
        // «N min andando» como una mancha tenue con borde punteado: se lee como
        // zona, no como una línea más entre las fronteras de barrio.
        const ring = L.circle([center.lat, center.lng], {
          renderer: rendererRef.current ?? undefined,
          radius: walkMinutes * WALK_METERS_PER_MINUTE,
          interactive: false,
          color: RING_INK,
          weight: 1.2,
          dashArray: "2 5",
          opacity: 0.5,
          fillColor: RING_INK,
          fillOpacity: 0.05,
          className: "tz-iso",
        });
        ringsRef.current?.addLayer(ring);
        const marker = L.marker([center.lat, center.lng], {
          interactive: false,
          zIndexOffset: 800,
          icon: centerPinIcon(center.name),
        });
        ringsRef.current?.addLayer(marker);
        centerMarkersRef.current.push(marker);
      });
    }

    paint();
    // Segundo encuadre, ya con geometría: si el primero se saltó por no tener
    // medidas el contenedor, este la coloca en su sitio; si no, es un no-op.
    frame();
    // El juego de puntos y de centros cambia con la ciudad: es lo que dispara la
    // reconstrucción, junto a los parámetros que redibujan los anillos.
  }, [points, centers, showCenters, walkMinutes, frame, paint, realRings, onGeometry]);

  // Cambio de métrica, resalte o foco: solo relleno, sin tocar geometría.
  useEffect(() => {
    paint();
  }, [colors, inks, dashed, values, hovered, focus, cellOpacity, paint]);

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

  // +/− de la botonera. Con movimiento reducido, de un salto.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomSignal) return;
    const animate = !prefersReducedMotion();
    if (zoomSignal.dir > 0) map.zoomIn(1, { animate });
    else map.zoomOut(1, { animate });
  }, [zoomSignal]);

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
    if (!point) return;
    // E11-10 · Con movimiento reducido se llega igual, pero de un salto.
    if (prefersReducedMotion()) map.setView([point.lat, point.lng], map.getZoom(), { animate: false });
    else map.panTo([point.lat, point.lng], { duration: 0.6 });
  }, [panTo, points]);

  return (
    <div
      ref={containerRef}
      className="tz-map tz-barrio-map absolute inset-0 bg-tz-sand"
      // E11-04 · Los polígonos son `<path>` con manejadores de ratón: no son
      // focusables ni tienen rol, así que para un lector de pantalla esto es un
      // rectángulo mudo. `role="application"` es lo honesto —hay interacción
      // propia dentro— y la etiqueta dice qué es y dónde está la alternativa.
      role="application"
      aria-label={ariaLabel ?? `Mapa de barrios por coropletas. La misma información, ordenable y con las seis métricas a la vez, está en la tabla «Ranking» junto al mapa. ${points.length} barrios.`}
    />
  );
}

/** Contenido del globo: nombre y cifra de la métrica activa. */
function tooltipHtml(name: string, value: string): string {
  return `<b>${escapeHtml(name)}</b>${value ? `<span>${escapeHtml(value)}</span>` : ""}`;
}

/** Los nombres de barrio entran en `innerHTML` del `divIcon`. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default BarrioMap;

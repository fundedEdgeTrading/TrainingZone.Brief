"use client";

import { useMemo, useState } from "react";
import {
  BARRIO_METRICS,
  colorForValue,
  colorsByCode,
  formatMetricValue,
  labelPriority,
  metricDef,
  metricScale,
  metricValue,
  rampForScale,
  readableMetricInk,
  sortByMetric,
  type BarrioCity,
  type BarrioMetric,
  type BarrioStat,
} from "@/lib/barrio-map";
import { HeaderActions, useHeaderSubtitle } from "../header-slot";
import BarrioMap from "./barrio-map-loader";

/** Nota que desaparece el día que entren las geometrías reales de barrio. */
const GEOMETRY_NOTE =
  "Geometría aproximada por teselación desde el centroide de cada CP. Sustituible por vuestro GeoJSON de barrios sin tocar el resto de la vista.";

/** Parámetros del mapa. Fijos hoy; el sitio natural de convertirlos en preferencia del centro. */
const WALK_MINUTES = 15;
const SHOW_CENTERS = true;
const CELL_OPACITY = 0.86;

const GLASS = "bg-brand-card/95 backdrop-blur-md border border-brand-border";

/**
 * Mapa de barrios a pantalla completa (RB-LEAD-010).
 *
 * El panel de control termina en una tarjeta con `leaflet.heat`: a escala
 * nacional —con centros en Zaragoza y Santander— los 19 barrios de Zaragoza se
 * funden en una sola mancha. Aquí cada barrio es un polígono con su borde, su
 * nombre y su cifra, y la misma geometría se recolorea con seis métricas: una
 * por cada pregunta que dirección marcó como necesaria.
 */
export function BarrioMapView({ cities, roleLabel }: { cities: BarrioCity[]; roleLabel: string }) {
  const [cityKey, setCityKey] = useState(cities[0].key);
  const [metric, setMetric] = useState<BarrioMetric>("members");
  const [focus, setFocus] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [frameSignal, setFrameSignal] = useState(0);
  const [panTo, setPanTo] = useState<{ code: string; signal: number } | null>(null);

  const city = cities.find((c) => c.key === cityKey) ?? cities[0];
  const def = metricDef(metric);

  useHeaderSubtitle(
    `${roleLabel} · ${city.label} · ${city.centers.length} ${city.centers.length === 1 ? "centro" : "centros"} · RB-LEAD-010`
  );

  const scale = useMemo(() => metricScale(city.points, metric), [city, metric]);
  const colors = useMemo(() => colorsByCode(city.points, metric), [city, metric]);
  const values = useMemo(
    () =>
      Object.fromEntries(
        city.points.map((p) => [p.code, formatMetricValue(metricValue(p, metric), metric)])
      ) as Record<string, string>,
    [city, metric]
  );
  const priority = useMemo(() => labelPriority(city.points, metric), [city, metric]);
  const rows = useMemo(() => sortByMetric(city.points, metric), [city, metric]);
  const maxAbs = useMemo(
    () => Math.max(1, ...city.points.map((p) => Math.abs(metricValue(p, metric)))),
    [city, metric]
  );

  // El barrio de la tarjeta: el que se está señalando, si no el fijado, si no el
  // primero del ranking (que es el que la métrica pone por delante).
  const spotlight: BarrioStat =
    city.points.find((p) => p.code === (hovered ?? focus)) ?? rows[0] ?? city.points[0];

  const selectCity = (key: string) => {
    setCityKey(key);
    setFocus(null);
    setHovered(null);
  };

  const selectBarrio = (code: string) => {
    setFocus(code);
    setHovered(code);
    setPanTo({ code, signal: Date.now() });
  };

  const resetView = () => {
    setFocus(null);
    setHovered(null);
    setFrameSignal((n) => n + 1);
  };

  return (
    <div data-full-bleed className="absolute inset-0">
      {cities.length > 1 && (
        <HeaderActions>
          <div className="hidden md:flex gap-[5px] bg-brand-bg border border-brand-border rounded-full p-1">
            {cities.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => selectCity(c.key)}
                className={`px-4 py-[7px] rounded-full text-[12.5px] font-semibold transition-all duration-150 ${
                  c.key === city.key ? "bg-tz-black text-tz-bone" : "text-brand-muted hover:text-brand-text"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </HeaderActions>
      )}

      <BarrioMap
        points={city.points}
        centers={city.centers}
        colors={colors}
        values={values}
        priority={priority}
        hovered={hovered}
        focus={focus}
        showLabels={showLabels}
        frameSignal={frameSignal}
        panTo={panTo}
        onHover={setHovered}
        onSelect={selectBarrio}
        walkMinutes={WALK_MINUTES}
        showCenters={SHOW_CENTERS}
        cellOpacity={CELL_OPACITY}
      />

      {/* Franja superior: métricas y pregunta a la izquierda, foco y ranking a la
          derecha. `pointer-events-none` en el contenedor para no robarle el mapa
          al ratón en el hueco entre tarjetas. */}
      <div className="absolute top-5 left-5 right-5 bottom-[76px] z-[500] flex items-start justify-between gap-4 pointer-events-none">
        <div className="flex flex-col gap-2.5 min-w-0 pointer-events-auto">
          <div
            data-tz-overlay
            className={`flex flex-wrap gap-1 ${GLASS} rounded-[14px] p-[5px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.4)]`}
          >
            {BARRIO_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`px-[15px] py-[9px] rounded-[10px] text-[12.5px] font-bold tracking-[.01em] whitespace-nowrap transition-colors duration-150 ${
                  m.key === metric ? "bg-tz-black text-tz-bone" : "text-brand-text-2 hover:bg-brand-bg"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div
            data-tz-overlay
            className="self-start bg-tz-black rounded-xl px-[15px] py-[9px] shadow-[0_10px_28px_-14px_rgba(29,29,28,.5)]"
          >
            <span className="text-[13px] font-semibold text-tz-bone">{def.question}</span>
          </div>
        </div>

        <div
          data-tz-overlay
          className="hidden lg:flex w-[344px] shrink-0 flex-col gap-3 max-h-full min-h-0 pointer-events-auto"
        >
          <div
            className={`shrink-0 ${GLASS} rounded-card p-[18px] pb-4 shadow-[0_18px_44px_-22px_rgba(29,29,28,.5)]`}
          >
            <div className="flex items-baseline justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  Barrio en foco
                </div>
                <div className="font-display font-extrabold text-[19px] leading-[1.15] text-brand-text mt-[5px]">
                  {spotlight.name}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className="font-display font-extrabold text-[26px] leading-none tz-nums"
                  style={{ color: readableMetricInk(colorForValue(metricValue(spotlight, metric), scale)) }}
                >
                  {formatMetricValue(metricValue(spotlight, metric), metric)}
                </div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[.06em] text-brand-muted mt-1">
                  {def.label}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <SpotlightCell label="Clientes" value={String(spotlight.members)} />
              <SpotlightCell label="Leads" value={String(spotlight.leads)} />
              <SpotlightCell label="Conversión" value={`${spotlight.conv}%`} />
              <SpotlightCell
                label="90 días"
                value={formatMetricValue(spotlight.trend, "trend")}
                className={
                  spotlight.trend > 0 ? "text-good" : spotlight.trend < 0 ? "text-critical" : "text-brand-text-2"
                }
              />
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-tz-sand">
              <span className="w-[9px] h-[9px] rounded-[3px] bg-tz-black shrink-0" />
              <span className="text-xs text-brand-text-2">
                {spotlight.nearestCenter
                  ? `${spotlight.dist} km hasta ${spotlight.nearestCenter}`
                  : "Sin centros situados en el mapa"}
              </span>
            </div>
          </div>

          <div
            className={`flex-1 min-h-24 overflow-hidden flex flex-col ${GLASS} rounded-card p-3.5 pb-2.5 shadow-[0_18px_44px_-22px_rgba(29,29,28,.5)]`}
          >
            <div className="shrink-0 text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint px-1 pb-2">
              Ranking · {def.label}
            </div>
            {/* La altura tiene que encoger, no ser fija: en una ventana de 13" la
                pila entera no cabe y sin esto las últimas filas son inalcanzables. */}
            <div className="tz-scroll flex-1 min-h-0 overflow-y-auto max-h-[296px] pr-1 flex flex-col gap-0.5">
              {rows.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onMouseEnter={() => setHovered(p.code)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => selectBarrio(p.code)}
                  className={`flex items-center gap-2.5 px-[9px] py-2 rounded-[10px] text-left transition-colors duration-150 ${
                    p.code === hovered || p.code === focus ? "bg-tz-sand" : "hover:bg-tz-sand"
                  }`}
                >
                  <span
                    className="w-2 h-[26px] rounded-[3px] shrink-0"
                    style={{ background: colors[p.code] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-brand-text truncate">{p.name}</span>
                      <span className="text-[12.5px] font-extrabold text-brand-text tz-nums shrink-0">
                        {formatMetricValue(metricValue(p, metric), metric)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full bg-tz-sand overflow-hidden">
                        <div
                          className="h-full rounded-full origin-left"
                          style={{
                            background: colors[p.code],
                            width: `${Math.round((Math.abs(metricValue(p, metric)) / maxAbs) * 100)}%`,
                            animation: "tzGrow .7s var(--ease-out-soft) both",
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-brand-muted whitespace-nowrap shrink-0 tz-nums">
                        {p.members}c · {p.leads}l
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:flex absolute left-5 bottom-5 z-[500] flex-col gap-2.5 max-w-[400px]">
        <div
          data-tz-overlay
          className={`${GLASS} rounded-[14px] px-[15px] pt-[13px] pb-3 shadow-[0_14px_34px_-20px_rgba(29,29,28,.5)]`}
        >
          <div className="flex items-baseline gap-2.5 whitespace-nowrap">
            <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">{def.label}</span>
            <span className="flex-1 h-px bg-tz-sand" />
            <span className="text-[11px] font-semibold text-brand-text-2">{def.note}</span>
          </div>
          <div className="flex gap-[3px] mt-[9px]">
            {rampForScale(scale).map((color) => (
              <span key={color} className="flex-1 h-3 rounded-[3px]" style={{ background: color }} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] font-bold text-brand-text-2 tz-nums">
              {formatMetricValue(scale.min, metric)}
            </span>
            <span className="text-[11px] font-bold text-brand-text-2 tz-nums">
              {formatMetricValue(scale.max, metric)}
            </span>
          </div>
          {/* Las dos claves solo se explican si hay algo que explicar: una ciudad
              sin centros situados no pinta ni cuadradito ni anillo. */}
          {city.centers.length > 0 && (
            <div className="flex items-center gap-4 mt-[11px] pt-2.5 border-t border-tz-sand">
              <div className="flex items-center gap-[7px]">
                <span className="w-[13px] h-[13px] rounded-[4px] bg-tz-black border-[2.5px] border-tz-bone shadow-[0_0_0_1px_var(--color-brand-border)] shrink-0" />
                <span className="text-[11px] font-semibold text-brand-text-2">Centro Training Zone</span>
              </div>
              <div className="flex items-center gap-[7px]">
                <span className="w-4 h-[13px] rounded-[3px] border-[1.5px] border-dashed border-brand-muted shrink-0" />
                <span className="text-[11px] font-semibold text-brand-text-2">{WALK_MINUTES} min andando</span>
              </div>
            </div>
          )}
        </div>
        <div data-tz-overlay className="text-[10.5px] font-medium text-brand-muted leading-[1.45] px-1">
          {GEOMETRY_NOTE}
        </div>
      </div>

      <div data-tz-overlay className="absolute right-5 bottom-5 z-[500] flex gap-2">
        <MapButton onClick={() => setShowLabels((v) => !v)}>
          {showLabels ? "Ocultar nombres" : "Ver nombres"}
        </MapButton>
        <MapButton onClick={resetView}>↺ Encuadrar</MapButton>
      </div>
    </div>
  );
}

function SpotlightCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-brand-bg rounded-[11px] px-[11px] py-[9px]">
      <div className="text-[10px] font-bold uppercase tracking-[.08em] text-brand-muted">{label}</div>
      <div className={`font-display font-extrabold text-[17px] mt-0.5 tz-nums ${className ?? "text-brand-text"}`}>
        {value}
      </div>
    </div>
  );
}

function MapButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-brand-border bg-brand-card/95 backdrop-blur-md rounded-full px-[15px] py-[9px] font-display text-[11.5px] font-bold tracking-[.03em] text-brand-text transition-colors duration-150 hover:bg-tz-black hover:text-tz-bone"
    >
      {children}
    </button>
  );
}

export default BarrioMapView;

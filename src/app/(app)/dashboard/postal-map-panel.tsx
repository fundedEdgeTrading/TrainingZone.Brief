"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { barrioMapHref } from "@/lib/barrio-map-params";
import type { DashboardRange } from "@/lib/dashboard-range";
import { SERIES } from "@/lib/chart-colors";
import {
  NO_ACTIVITY_FILL,
  classifyCounts,
  colorForValueClassified,
  groupBarriosByCity,
  inksByCode,
  legendSteps,
  type BarrioCenter,
  type BarrioStat,
} from "@/lib/barrio-map";
import { PanelCard } from "./panel-card";
import BarrioMap from "../mapa-barrios/barrio-map-loader";

type MapMetric = "all" | "members" | "leads";

const SEGMENTS: { key: MapMetric; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "members", label: "Clientes" },
  { key: "leads", label: "Leads" },
];

const METRIC_LABEL: Record<MapMetric, string> = {
  all: "clientes + leads",
  members: "clientes",
  leads: "leads",
};

/** Minutos andando del anillo de cada centro: el mismo que el mapa de barrios. */
const WALK_MINUTES = 15;

function valueOf(p: BarrioStat, metric: MapMetric) {
  return metric === "leads" ? p.leads : metric === "members" ? p.members : p.total;
}

/**
 * BI-3: mapa + ranking de barrios fusionados en una única tarjeta. Comparten
 * estado (barrio señalado/fijado) para el cruce mapa↔lista, y leen del mismo
 * dataset (`getPostalPanelData`), así que sus totales no pueden divergir.
 *
 * Rediseño 2026-09 · **coropleta por ciudad**. La tarjeta era un mapa de
 * burbujas encuadrado sobre TODAS las ciudades a la vez: con Zaragoza y
 * Santander a 350 km, el encuadre bajaba a escala de país y los barrios de cada
 * ciudad se fundían en una sola burbuja, encima de un `heatLayer` difuminado
 * que añadía una mancha gris. Dirección veía dos manchas y un ranking.
 *
 * Ahora se mira una ciudad cada vez, con el contorno oficial de cada código
 * postal coloreado por volumen —la misma rampa, la misma leyenda y el mismo
 * motor que el mapa de barrios (`BarrioMap`)—, los centros como chincheta con su
 * radio de 15 min andando, y el cero como "sin actividad" en vez de como un
 * color más. El selector de ciudad manda sobre el mapa, las cifras y el ranking.
 */
export function PostalMapPanel({
  points,
  areas,
  centers,
  opportunity,
  range,
  centerId,
}: {
  /** Barrios con datos, de más a menos volumen (todas las ciudades). */
  points: BarrioStat[];
  /** Todos los CP de referencia, también los que están a cero: son la forma de la ciudad. */
  areas: BarrioStat[];
  centers: BarrioCenter[];
  /** Barrio con más leads en proporción a sus clientes. `null` si no hay ninguno con volumen. */
  opportunity: BarrioStat | null;
  /** E11-07 · Periodo y centro activos del panel, para encadenarlos al mapa. */
  range: DashboardRange;
  centerId: string | null;
}) {
  const [metric, setMetric] = useState<MapMetric>("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [frameSignal, setFrameSignal] = useState(0);
  const [panTo, setPanTo] = useState<{ code: string; signal: number } | null>(null);
  const [zoomSignal, setZoomSignal] = useState<{ dir: 1 | -1; signal: number } | null>(null);

  const cities = useMemo(() => groupBarriosByCity(areas, centers), [areas, centers]);
  // De entrada, la ciudad con más volumen: es la que dirección quiere ver.
  const busiest = useMemo(
    () =>
      [...cities].sort(
        (a, b) => b.points.reduce((s, p) => s + p.total, 0) - a.points.reduce((s, p) => s + p.total, 0)
      )[0]?.key ?? null,
    [cities]
  );
  const [cityKey, setCityKey] = useState<string | null>(busiest);
  const city = cities.find((c) => c.key === cityKey) ?? cities.find((c) => c.key === busiest) ?? cities[0] ?? null;

  const cityPoints = useMemo(() => city?.points ?? [], [city]);
  // Filtrado por métrica: un barrio sin leads (o sin clientes) sale del ranking
  // cuando esa segmentación está activa, en vez de quedarse al final a cero.
  const rows = useMemo(
    () => cityPoints.filter((p) => valueOf(p, metric) > 0).sort((a, b) => valueOf(b, metric) - valueOf(a, metric)),
    [cityPoints, metric]
  );

  const classification = useMemo(() => classifyCounts(cityPoints.map((p) => valueOf(p, metric))), [cityPoints, metric]);
  const colors = useMemo(
    () =>
      Object.fromEntries(
        cityPoints.map((p) => [p.code, colorForValueClassified(valueOf(p, metric), classification)])
      ) as Record<string, string>,
    [cityPoints, metric, classification]
  );
  const inks = useMemo(() => inksByCode(colors), [colors]);
  const values = useMemo(
    () => Object.fromEntries(cityPoints.map((p) => [p.code, String(valueOf(p, metric))])) as Record<string, string>,
    [cityPoints, metric]
  );
  const priority = useMemo(
    () => [...cityPoints].sort((a, b) => valueOf(b, metric) - valueOf(a, metric)).map((p) => p.code),
    [cityPoints, metric]
  );
  const steps = useMemo(() => legendSteps(classification), [classification]);

  const maxValue = Math.max(1, ...rows.map((p) => valueOf(p, metric)));
  const cityMembers = cityPoints.reduce((s, p) => s + p.members, 0);
  const cityLeads = cityPoints.reduce((s, p) => s + p.leads, 0);
  const top = rows[0] ?? null;
  const active = cityPoints.find((p) => p.code === (hovered ?? focus)) ?? null;
  const spotlight = active ?? top;

  // Las ciudades presentes salen de los propios datos: la tarjeta no puede
  // prometer "Zaragoza" cuando la organización ya tiene un centro en Santander.
  const cityLabels = cities.map((c) => c.label).join(" · ");

  const selectCity = (key: string) => {
    setCityKey(key);
    setFocus(null);
    setHovered(null);
  };

  /** Conmutador: un segundo clic sobre el mismo barrio lo suelta. */
  const select = (code: string) => {
    if (code === focus) {
      setFocus(null);
      setHovered(null);
      return;
    }
    setFocus(code);
    setHovered(code);
    setPanTo({ code, signal: Date.now() });
  };

  /** La oportunidad puede estar en la otra ciudad: se cambia de ciudad y se fija. */
  const selectOpportunity = () => {
    if (!opportunity) return;
    const owner = cities.find((c) => c.points.some((p) => p.code === opportunity.code));
    if (owner && owner.key !== city?.key) setCityKey(owner.key);
    setFocus(opportunity.code);
    setHovered(opportunity.code);
    setPanTo({ code: opportunity.code, signal: Date.now() });
  };

  const resetView = () => {
    setFocus(null);
    setHovered(null);
    setFrameSignal((n) => n + 1);
  };

  return (
    <PanelCard
      title="Mapa de calor por barrio"
      meta={["clientes y leads", cityLabels].filter(Boolean).join(" · ")}
      size="lg"
      delay={0.1}
      action={
        <div className="flex items-center gap-2.5">
          {/* La tarjeta responde "dónde hay volumen"; el resto de preguntas
              (conversión, tendencia, distancia, oportunidad) piden el plano
              entero, y ahí es donde vive el mapa de barrios. */}
          <Link
            // E11-07 · El enlace encadena el estado del panel: sin esto,
            // dirección pasaba de "leads de este trimestre" a "leads desde
            // siempre" sin que nada lo dijera, y con los mismos rótulos.
            href={barrioMapHref({ range, centerId })}
            // Sin prefetch: pasar el ratón por encima no tiene por qué lanzar la
            // consulta geográfica entera en el servidor. Además el prefetch de
            // esta ruta compite con la navegación real —dos peticiones RSC para
            // el mismo segmento, y la que se aborta puede dejar el `main`
            // vacío—, que es un fallo que se reprodujo en los e2e.
            prefetch={false}
            className="hidden sm:flex items-center gap-1.5 border border-tz-sand rounded-pill px-3.5 py-1.5 font-display text-xs font-semibold text-brand-text-2 transition-colors duration-150 hover:bg-brand-ink hover:text-tz-bone hover:border-brand-ink"
          >
            Mapa de barrios
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          <div className="flex gap-[5px] bg-brand-bg border border-tz-sand rounded-pill p-1">
            {SEGMENTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setMetric(s.key)}
                aria-pressed={metric === s.key}
                className={`px-3.5 py-1.5 rounded-pill font-display text-xs font-semibold transition-all duration-150 ${
                  metric === s.key ? "bg-brand-ink text-tz-bone" : "text-brand-muted hover:text-brand-text"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {points.length === 0 || !city ? (
        <p className="text-sm text-brand-muted">Sin códigos postales geolocalizables todavía.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5 mb-4">
            {/* La ciudad manda sobre todo lo de abajo: mapa, cifras y ranking. */}
            {cities.length > 1 && (
              <div role="group" aria-label="Ciudad" className="flex gap-[5px] bg-brand-bg border border-tz-sand rounded-pill p-1 mr-1">
                {cities.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => selectCity(c.key)}
                    aria-pressed={c.key === city.key}
                    className={`px-3.5 py-1.5 rounded-pill font-display text-xs font-semibold transition-all duration-150 ${
                      c.key === city.key ? "bg-brand-ink text-tz-bone" : "text-brand-muted hover:text-brand-text"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <SummaryChip value={cityMembers} label="clientes" color={SERIES.gold} />
            <SummaryChip value={cityLeads} label="leads" />
            <SummaryChip value={rows.length} label={rows.length === 1 ? "barrio activo" : "barrios activos"} />
            {opportunity && (
              // Demanda que existe y todavía no se ha convertido: el barrio con
              // más leads por cliente. Es la única lectura accionable de la
              // tarjeta que no se ve mirando colores; al pulsarla, el mapa va.
              <button
                type="button"
                onClick={selectOpportunity}
                title="Ver en el mapa"
                className="flex items-baseline gap-1.5 bg-critical-bg rounded-xl px-3.5 py-2 transition-shadow hover:shadow-[0_0_0_1.5px_var(--color-critical)]"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-critical">oportunidad</span>
                <span className="font-display font-bold text-sm text-critical">{opportunity.name}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-[18px]">
            <div className="relative rounded-[14px] overflow-hidden border border-brand-border h-[380px] sm:h-[460px]">
              <BarrioMap
                cityKey={city.key}
                points={cityPoints}
                centers={city.centers}
                colors={colors}
                inks={inks}
                dashed={{}}
                values={values}
                priority={priority}
                hovered={hovered}
                focus={focus}
                showLabels
                frameSignal={frameSignal}
                zoomSignal={zoomSignal}
                panTo={panTo}
                onHover={setHovered}
                onSelect={select}
                walkMinutes={WALK_MINUTES}
                scrollZoom={false}
                fit="card"
                ariaLabel={`Mapa de ${city.label} por código postal, coloreado por ${METRIC_LABEL[metric]}. El mismo dato está en el ranking junto al mapa.`}
              />

              {/* El barrio señalado: nombre, CP y las dos cifras. Sin hover,
                  el que encabeza el ranking. */}
              {spotlight && (
                <div
                  data-tz-overlay
                  // En móvil no cabe junto a los botones: ahí ya cuentan lo mismo
                  // el globo del barrio y el ranking de debajo.
                  className="hidden sm:block absolute top-3 left-3 z-[500] bg-brand-card/95 backdrop-blur-sm border border-brand-border rounded-xl px-[13px] py-2.5 min-w-[160px] max-w-[50%] shadow-[0_10px_24px_-14px_rgba(29,29,28,.45)] pointer-events-none"
                >
                  <div className="text-[9.5px] font-bold tracking-[.14em] uppercase text-brand-faint">
                    {active ? `CP ${active.code}` : "Más volumen"}
                  </div>
                  <div className="text-[15px] font-bold text-brand-text mt-0.5 truncate">{spotlight.name}</div>
                  <div className="text-[11.5px] text-brand-text-2 tz-nums mt-0.5">
                    {spotlight.members} clientes · {spotlight.leads} leads
                  </div>
                </div>
              )}

              <div data-tz-overlay className="absolute top-3 right-3 z-[500] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={resetView}
                  className="border border-brand-border bg-brand-card/95 backdrop-blur-sm rounded-pill px-[13px] min-h-[36px] font-display text-[11px] font-semibold tracking-[.03em] text-brand-text transition-colors duration-150 hover:bg-brand-ink hover:text-tz-bone"
                >
                  ↺ Vista general
                </button>
                <div className="flex rounded-pill border border-brand-border bg-brand-card/95 backdrop-blur-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setZoomSignal({ dir: 1, signal: Date.now() })}
                    aria-label="Acercar"
                    className="w-9 min-h-[36px] text-[15px] font-bold text-brand-text transition-colors duration-150 hover:bg-brand-ink hover:text-tz-bone"
                  >
                    +
                  </button>
                  <span className="w-px bg-brand-border" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setZoomSignal({ dir: -1, signal: Date.now() })}
                    aria-label="Alejar"
                    className="w-9 min-h-[36px] text-[15px] font-bold text-brand-text transition-colors duration-150 hover:bg-brand-ink hover:text-tz-bone"
                  >
                    −
                  </button>
                </div>
              </div>

              {/* Leyenda con la escala real: un testigo por escalón con su
                  corte, y las dos claves que no son escalón. */}
              <div
                data-tz-overlay
                data-tz-legend
                className="absolute left-3 bottom-5 z-[500] max-w-[calc(100%-24px)] bg-brand-card/95 backdrop-blur-sm border border-brand-border rounded-xl px-3 py-2.5 shadow-[0_10px_24px_-14px_rgba(29,29,28,.45)]"
              >
                <div className="text-[9.5px] font-bold tracking-[.14em] uppercase text-brand-faint">
                  {METRIC_LABEL[metric]} por código postal
                </div>
                {steps.length > 0 ? (
                  <div className="flex gap-[3px] mt-1.5">
                    {steps.map((step, i) => (
                      <div key={i} className="w-9 sm:w-11">
                        <span className="block h-2 rounded-[3px]" style={{ background: step.color }} />
                        <span className="block text-center text-[10px] font-bold text-brand-text-2 tz-nums mt-0.5">
                          {i === steps.length - 1 && steps.length > 1 ? "≥" : ""}
                          {Math.round(step.from)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-semibold text-brand-text-2 mt-1">Sin actividad en este periodo</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-tz-sand">
                  <LegendKey label="Sin actividad">
                    <span className="w-[11px] h-[11px] rounded-[3px] border border-brand-border" style={{ background: NO_ACTIVITY_FILL }} />
                  </LegendKey>
                  {city.centers.length > 0 && (
                    <>
                      <LegendKey label="Centro">
                        <span className="w-[10px] h-[10px] rounded-[50%_50%_50%_0] -rotate-45 bg-[#1d1d1c] border-[1.5px] border-white shadow-[0_0_0_1px_var(--color-brand-border)]" />
                      </LegendKey>
                      <LegendKey label={`${WALK_MINUTES} min andando`}>
                        <span className="w-[11px] h-[11px] rounded-full border-[1.5px] border-dashed border-brand-muted bg-brand-muted/10" />
                      </LegendKey>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col min-h-0">
              <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  Ranking · {city.label}
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  {METRIC_LABEL[metric]}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-brand-muted px-1">
                  Sin {metric === "leads" ? "leads" : metric === "members" ? "clientes" : "clientes ni leads"} en{" "}
                  {city.label} en este periodo.
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[420px] pr-1 flex flex-col gap-[3px] tz-scroll">
                  {rows.map((p, i) => {
                    const on = p.code === hovered || p.code === focus;
                    return (
                      <button
                        key={p.code}
                        type="button"
                        onMouseEnter={() => setHovered(p.code)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => select(p.code)}
                        aria-pressed={p.code === focus}
                        className={`flex items-center gap-[11px] px-2.5 py-[9px] rounded-[11px] text-left transition-colors duration-150 ${
                          on ? "bg-tz-sand" : "hover:bg-tz-sand"
                        }`}
                      >
                        <span className="w-5 shrink-0 text-right font-display text-xs font-bold tz-nums text-brand-faint">
                          {i + 1}
                        </span>
                        {/* El testigo lleva el color de su contorno en el mapa. */}
                        <span
                          aria-hidden="true"
                          className="w-2 h-[26px] rounded-[3px] shrink-0 shadow-[inset_0_0_0_1px_rgba(29,29,28,.12)]"
                          style={{ background: colors[p.code] }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-semibold text-brand-text truncate">{p.name}</span>
                            <span className="text-[13px] font-bold text-brand-text tz-nums shrink-0">{valueOf(p, metric)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-[5px]">
                            {/* Barra apilada: en la misma pista se ve cuánto del
                                volumen del barrio es cliente y cuánto sigue siendo
                                lead, que es la pregunta que se hace dirección. */}
                            <div className="flex-1 flex h-1.5 rounded-pill bg-brand-bg overflow-hidden">
                              <div
                                className="h-full origin-left"
                                style={{
                                  width: `${((metric === "leads" ? 0 : p.members) / maxValue) * 100}%`,
                                  background: SERIES.gold,
                                  animation: `tzGrow .8s var(--ease-out-soft) ${(0.1 + Math.min(i, 8) * 0.04).toFixed(2)}s both`,
                                }}
                              />
                              <div
                                className="h-full origin-left"
                                style={{
                                  width: `${((metric === "members" ? 0 : p.leads) / maxValue) * 100}%`,
                                  background: SERIES.ink,
                                  animation: `tzGrow .8s var(--ease-out-soft) ${(0.14 + Math.min(i, 8) * 0.04).toFixed(2)}s both`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-brand-muted whitespace-nowrap shrink-0 tz-nums">
                              {p.members}c · {p.leads}l
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-4 border-t border-tz-sand pt-2.5 mt-1.5">
                <LegendDot color={SERIES.gold} label="clientes" />
                <LegendDot color={SERIES.ink} label="leads" />
                {top && (
                  <span className="ml-auto text-[10.5px] font-semibold text-brand-muted truncate">
                    Foco: <span className="text-brand-text">{top.name}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </PanelCard>
  );
}

function LegendKey({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="shrink-0 grid place-items-center">
        {children}
      </span>
      <span className="text-[10px] font-semibold text-brand-muted whitespace-nowrap">{label}</span>
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-brand-muted">
      <span className="w-[9px] h-[9px] rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function SummaryChip({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 bg-brand-bg border border-tz-sand rounded-xl px-3.5 py-2">
      <span
        className="font-display font-bold text-lg tz-nums"
        style={{ color: color ?? "var(--color-brand-text)" }}
      >
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-brand-muted">{label}</span>
    </div>
  );
}

export default PostalMapPanel;

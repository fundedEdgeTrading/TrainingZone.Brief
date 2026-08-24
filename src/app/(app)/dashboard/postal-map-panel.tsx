"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { postalCityLabel } from "@/lib/postal-codes";
import { SERIES } from "@/lib/chart-colors";
import { PanelCard } from "./panel-card";
import PostalHeatmap, { type MapMetric } from "./postal-heatmap-loader";

type PostalCodeStat = { code: string; name: string; lat: number; lng: number; leads: number; members: number; total: number };

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

/** BI-3: mapa de calor + ranking de barrios fusionados en una única tarjeta
 * (sustituye a la antigua pareja "Mapa de calor" / "Distribución por provincia"):
 * comparten estado (barrio resaltado/seleccionado) para el cruce mapa↔lista, y
 * ambos leen del mismo dataset (getPostalPanelData) así que sus totales nunca
 * pueden divergir entre sí. Granularidad de CP completo (no provincia): a escala
 * de ciudad la provincia no distingue nada, y el encuadre del mapa ya se adapta
 * solo a las ciudades que haya en los datos.
 *
 * Rediseño 2026-08: la tarjeta sube a la segunda fila de la página —era lo que
 * más destaca y estaba al final— y gana el chip de "oportunidad", la tarjeta
 * flotante del barrio activo y la barra apilada clientes+leads del ranking.
 *
 * La métrica sigue siendo estado de cliente, no de URL, a diferencia del resto
 * del panel: al cambiarla los marcadores no se desmontan, así que el radio de
 * la burbuja interpola en vez de saltar. Reconsultar el servidor a cada clic se
 * llevaría por delante justamente esa transición.
 */
export function PostalMapPanel({
  points,
  opportunity,
}: {
  points: PostalCodeStat[];
  /** Barrio con más leads en proporción a sus clientes. `null` si no hay ninguno con volumen. */
  opportunity: PostalCodeStat | null;
}) {
  const [metric, setMetric] = useState<MapMetric>("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const [flyToCode, setFlyToCode] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const metricValue = (p: PostalCodeStat) => (metric === "leads" ? p.leads : metric === "members" ? p.members : p.total);

  // Filtrado por métrica: un barrio sin leads (o sin clientes) desaparece del
  // mapa y del ranking cuando esa segmentación está activa, en vez de quedarse
  // pintado a tamaño mínimo como si el filtro no hubiera hecho nada.
  const rows = useMemo(
    () =>
      [...points]
        .filter((p) => metricValue(p) > 0)
        .sort((a, b) => metricValue(b) - metricValue(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, metric]
  );
  const maxValue = Math.max(1, ...rows.map((p) => metricValue(p)));
  const totalMembers = points.reduce((s, p) => s + p.members, 0);
  const totalLeads = points.reduce((s, p) => s + p.leads, 0);
  const topName = rows[0]?.name ?? "—";
  const active = rows.find((p) => p.code === hovered) ?? null;
  // Las ciudades presentes salen de los propios datos: la tarjeta no puede
  // prometer "Zaragoza" cuando la organización ya tiene un centro en Santander.
  const cities = useMemo(
    () => [...new Set(points.map((p) => postalCityLabel(p.code)).filter((c): c is string => !!c))].join(" · "),
    [points]
  );

  const select = (code: string) => {
    setHovered(code);
    setFlyToCode(code);
  };

  return (
    <PanelCard
      title="Mapa de calor por barrio"
      meta={["clientes y leads", cities].filter(Boolean).join(" · ")}
      size="lg"
      delay={0.1}
      action={
        <div className="flex items-center gap-2.5">
          {/* La tarjeta responde "dónde hay volumen"; el resto de preguntas
              (conversión, tendencia, distancia, oportunidad) piden el plano
              entero, y ahí es donde vive el mapa de barrios. */}
          <Link
            href="/mapa-barrios"
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
      {points.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin códigos postales geolocalizables todavía.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-brand-muted">
          Sin {metric === "leads" ? "leads" : "clientes"} geolocalizables todavía.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2.5 mb-4">
            <SummaryChip value={totalMembers} label="clientes" color={SERIES.gold} />
            <SummaryChip value={totalLeads} label="leads" />
            <SummaryChip value={rows.length} label="barrios" />
            <div className="flex items-baseline gap-1.5 bg-brand-ink rounded-xl px-3.5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-apta-gold">foco</span>
              <span className="font-display font-bold text-sm text-tz-bone">{topName}</span>
            </div>
            {opportunity && (
              // Demanda que existe y todavía no se ha convertido: el barrio con
              // más leads por cliente. Es la única lectura accionable de la
              // tarjeta que no se ve mirando tamaños de burbuja.
              <div className="flex items-baseline gap-1.5 bg-critical-bg rounded-xl px-3.5 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-critical">oportunidad</span>
                <span className="font-display font-bold text-sm text-critical">{opportunity.name}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-[18px]">
            <div className="relative rounded-[14px] overflow-hidden border border-brand-border min-h-[440px]">
              {/*
                Se le pasa la lista completa y estable: el mapa filtra y
                dimensiona por métrica sin rehacer los marcadores, para que el
                radio de la burbuja interpole al cambiar de métrica.
              */}
              <PostalHeatmap
                points={points}
                metric={metric}
                hoveredCode={hovered}
                onHoverProvince={setHovered}
                onSelectProvince={select}
                flyToCode={flyToCode}
                resetSignal={resetSignal}
              />
              {/* Tarjeta del barrio activo: el hover del mapa deja de tener que
                  competir con el tooltip de Leaflet para contar quién es. */}
              <div className="absolute top-3 left-3 z-[500] bg-white/92 backdrop-blur-sm border border-tz-sand rounded-xl px-[13px] py-2.5 min-w-[150px]">
                <div className="text-[9.5px] font-bold tracking-[.14em] uppercase text-brand-faint">
                  {active ? `CP ${active.code}` : "Foco actual"}
                </div>
                <div className="text-[15px] font-bold text-brand-text mt-0.5">{active?.name ?? topName}</div>
                <div className="text-[11.5px] text-brand-text-2 tz-nums mt-0.5">
                  {(active ?? rows[0]).members} clientes · {(active ?? rows[0]).leads} leads
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetSignal((n) => n + 1);
                  setHovered(null);
                }}
                className="absolute top-3 right-3 z-[500] border border-tz-sand bg-white/90 backdrop-blur-sm rounded-pill px-[13px] py-[7px] font-display text-[11px] font-semibold tracking-[.03em] text-brand-text transition-colors duration-150 hover:bg-brand-ink hover:text-tz-bone"
              >
                ↺ Vista general
              </button>
              <div className="absolute left-3 bottom-5 z-[500] flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-tz-sand rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-[9px] h-[9px] rounded-full bg-brand-ink" />
                  <span className="w-[15px] h-[15px] rounded-full bg-brand-ink" />
                  <span className="text-[10px] font-semibold text-brand-muted">volumen</span>
                </div>
                <div className="w-px h-4 bg-tz-sand" />
                <div className="flex items-center gap-1.5">
                  <span className="w-[13px] h-[13px] rounded-full bg-gradient-to-br from-apta-gold/70 to-apta-gold" />
                  <span className="text-[10px] font-semibold text-brand-muted">mayor foco</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  Ranking por barrio
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-brand-faint">
                  {METRIC_LABEL[metric]}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[440px] pr-1 flex flex-col gap-[3px]">
                {rows.map((p, i) => (
                  <button
                    key={p.code}
                    type="button"
                    onMouseEnter={() => setHovered(p.code)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => select(p.code)}
                    className={`flex items-center gap-[11px] px-2.5 py-[9px] rounded-[11px] text-left transition-colors duration-150 ${
                      hovered === p.code ? "bg-tz-sand" : "hover:bg-tz-sand"
                    }`}
                  >
                    <span
                      className={`w-5 shrink-0 text-right font-display text-xs font-bold tz-nums ${
                        i === 0 ? "text-gold" : "text-brand-faint"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-brand-text truncate">{p.name}</span>
                        <span className="text-[13px] font-bold text-brand-text tz-nums shrink-0">{metricValue(p)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-[5px]">
                        {/* Barra apilada: en la misma pista se ve cuánto del
                            volumen del barrio es cliente y cuánto sigue siendo
                            lead, que es la pregunta que se hace dirección. */}
                        <div className="flex-1 flex h-1.5 rounded-pill bg-brand-bg overflow-hidden">
                          <div
                            className="h-full origin-left"
                            style={{
                              width: `${(p.members / maxValue) * 100}%`,
                              background: SERIES.gold,
                              animation: `tzGrow .8s var(--ease-out-soft) ${(0.1 + Math.min(i, 8) * 0.04).toFixed(2)}s both`,
                            }}
                          />
                          <div
                            className="h-full origin-left"
                            style={{
                              width: `${(p.leads / maxValue) * 100}%`,
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
                ))}
              </div>
              <div className="flex items-center gap-4 border-t border-tz-sand pt-2.5 mt-1.5">
                <LegendDot color={SERIES.gold} label="clientes" />
                <LegendDot color={SERIES.ink} label="leads" />
              </div>
            </div>
          </div>
        </>
      )}
    </PanelCard>
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

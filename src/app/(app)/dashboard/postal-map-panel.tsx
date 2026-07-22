"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/kpi-card";
import PostalHeatmap, { type MapMetric } from "./postal-heatmap-loader";

type ProvinceStat = { code: string; name: string; lat: number; lng: number; leads: number; members: number; total: number };

const SEGMENTS: { key: MapMetric; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "leads", label: "Leads" },
  { key: "members", label: "Clientes" },
];

/** BI-3: mapa de calor + ranking de provincias fusionados en una única tarjeta
 * (sustituye a la antigua pareja "Mapa de calor" / "Distribución por provincia"):
 * comparten estado (provincia resaltada/seleccionada) para el cruce mapa↔lista, y
 * ambos leen del mismo dataset (getPostalProvinceStats) así que sus totales nunca
 * pueden divergir entre sí. */
export function PostalMapPanel({ points }: { points: ProvinceStat[] }) {
  const [metric, setMetric] = useState<MapMetric>("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const [flyToCode, setFlyToCode] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const rows = useMemo(() => [...points].sort((a, b) => b.total - a.total), [points]);
  const maxTotal = Math.max(1, ...rows.map((p) => p.total));
  const totalMembers = rows.reduce((s, p) => s + p.members, 0);
  const totalLeads = rows.reduce((s, p) => s + p.leads, 0);
  const topName = rows[0]?.name ?? "—";

  const select = (code: string) => {
    setHovered(code);
    setFlyToCode(code);
  };

  return (
    <Card
      title="Mapa de calor"
      meta="leads + clientes por provincia"
      delay={0.64}
      action={
        <div className="flex gap-[5px] bg-tz-bone border border-tz-sand rounded-full p-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setMetric(s.key)}
              className={`px-3.5 py-1.5 rounded-full font-display text-xs font-semibold transition-all duration-150 ${
                metric === s.key ? "bg-tz-black text-tz-bone" : "text-brand-muted hover:text-brand-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="-mt-2 mb-4 text-[11px] font-semibold uppercase tracking-[.08em] text-brand-faint">
        RB-LEAD-010 · distribución geográfica
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin códigos postales geolocalizables todavía.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2.5 mb-4">
            <SummaryChip value={totalMembers} label="clientes" />
            <SummaryChip value={totalLeads} label="leads" />
            <SummaryChip value={rows.length} label="provincias" />
            <div className="flex items-baseline gap-1.5 bg-tz-black rounded-xl px-3.5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-apta-gold">foco</span>
              <span className="font-display font-bold text-sm text-tz-bone">{topName}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-[18px]">
            <div className="relative rounded-2xl overflow-hidden border border-tz-linen">
              <PostalHeatmap
                points={rows}
                metric={metric}
                hoveredCode={hovered}
                onHoverProvince={setHovered}
                onSelectProvince={select}
                flyToCode={flyToCode}
                resetSignal={resetSignal}
              />
              <button
                type="button"
                onClick={() => {
                  setResetSignal((n) => n + 1);
                  setHovered(null);
                }}
                className="absolute top-3 right-3 z-[500] border border-tz-sand bg-white/90 backdrop-blur-sm rounded-full px-[13px] py-[7px] font-display text-[11px] font-semibold tracking-[.03em] text-brand-text transition-colors duration-150 hover:bg-tz-black hover:text-tz-bone"
              >
                ↺ Vista general
              </button>
              <div className="absolute left-3 bottom-5 z-[500] flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-tz-sand rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-[9px] h-[9px] rounded-full bg-tz-black" />
                  <span className="w-[15px] h-[15px] rounded-full bg-tz-black" />
                  <span className="text-[10px] font-semibold text-brand-muted">volumen</span>
                </div>
                <div className="w-px h-4 bg-tz-sand" />
                <div className="flex items-center gap-1.5">
                  <span className="w-[13px] h-[13px] rounded-full bg-gradient-to-br from-[#e2c896] to-apta-gold" />
                  <span className="text-[10px] font-semibold text-brand-muted">mayor foco</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-brand-faint mb-2 px-1">
                Ranking por provincia
              </div>
              <div className="flex-1 overflow-y-auto max-h-[412px] pr-1 flex flex-col gap-[3px]">
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
                    <span className="w-5 shrink-0 text-right font-display text-xs font-bold text-brand-faint tz-nums">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-brand-text truncate">{p.name}</span>
                        <span className="text-[13px] font-extrabold text-brand-text tz-nums shrink-0">{p.total}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-[5px]">
                        <div className="flex-1 h-[5px] rounded-full bg-tz-sand overflow-hidden">
                          <div
                            className="h-full rounded-full bg-tz-black transition-[width] duration-500"
                            style={{ width: `${(p.total / maxTotal) * 100}%` }}
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
        </>
      )}
    </Card>
  );
}

function SummaryChip({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5 bg-tz-bone border border-tz-sand rounded-xl px-3.5 py-2">
      <span className="font-display font-extrabold text-lg text-brand-text tz-nums">{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-brand-muted">{label}</span>
    </div>
  );
}

export default PostalMapPanel;

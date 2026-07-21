"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, type TooltipContentProps } from "recharts";
import { BRAND, INK } from "@/lib/chart-colors";

const axisStyle = { fontSize: 12, fontWeight: 600, fill: INK.muted };

type Point = { label: string; value: number | null };

function MetricTooltip({ active, payload, label, unit }: TooltipContentProps & { unit: string }) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div
      className="flex flex-col gap-1 bg-brand-ink border border-[#33332d] rounded-xl px-[13px] pt-[9px] pb-2.5 shadow-[0_16px_38px_-10px_rgba(0,0,0,.55)]"
      style={{ animation: "tzPop .13s ease both" }}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[.03em] text-brand-muted-2">{label}</span>
      <span className="font-display font-extrabold text-sm leading-[1.05] text-white">
        {typeof value === "number" ? `${value} ${unit}` : "—"}
      </span>
    </div>
  );
}

// Gráfica genérica de una sola métrica en el tiempo (p.ej. % graso). Serie única: no necesita
// leyenda, el título de la tarjeta contenedora ya la nombra.
export function SingleMetricChart({ points, unit }: { points: Point[]; unit: string }) {
  const withData = points.filter((p) => p.value != null);
  if (withData.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={withData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.gridline} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} domain={["dataMin - 2", "dataMax + 2"]} />
        <Tooltip content={(props: TooltipContentProps) => <MetricTooltip {...props} unit={unit} />} />
        <Line type="monotone" dataKey="value" stroke={BRAND.yellow} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

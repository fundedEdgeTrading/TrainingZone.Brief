"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, type TooltipContentProps } from "recharts";
import { BRAND, INK } from "@/lib/chart-colors";

const axisStyle = { fontSize: 12, fontWeight: 600, fill: INK.muted };

type Point = { label: string; weightKg: number | null; muscleMassKg: number | null; fatMassKg: number | null };

function CompositionTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="flex flex-col gap-1 bg-brand-ink border border-[#33332d] rounded-xl px-[13px] pt-[9px] pb-2.5 shadow-[0_16px_38px_-10px_rgba(0,0,0,.55)]"
      style={{ animation: "tzPop .13s ease both" }}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[.03em] text-brand-muted-2">{label}</span>
      {payload.map((p) => (
        <span key={p.dataKey as string} className="font-display font-extrabold text-sm leading-[1.05] text-white">
          {p.name}: {p.value != null ? `${p.value} kg` : "—"}
        </span>
      ))}
    </div>
  );
}

// CC3 (docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md): evolución de peso vs. masa muscular vs.
// masa grasa a partir de la serie de MemberProgressEntry ya cargada en la ficha del socio.
export function BodyCompositionChart({ points }: { points: Point[] }) {
  const withData = points.filter((p) => p.weightKg != null || p.muscleMassKg != null || p.fatMassKg != null);
  if (withData.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={withData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.gridline} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={(props: TooltipContentProps) => <CompositionTooltip {...props} />} />
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, color: INK.secondary }} />
        <Line type="monotone" dataKey="weightKg" name="Peso" stroke={BRAND.yellow} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="muscleMassKg" name="Masa muscular" stroke={INK.secondary} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="fatMassKg" name="Masa grasa" stroke={BRAND.inkSoft} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

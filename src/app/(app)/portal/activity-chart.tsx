"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  type TooltipContentProps,
} from "recharts";
import { BRAND, INK } from "@/lib/chart-colors";

const axisStyle = { fontSize: 12, fontWeight: 600, fill: INK.muted };

function ActivityTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const label = (item.payload as { label?: string })?.label ?? "";
  return (
    <div
      className="flex items-center gap-2.5 bg-brand-ink border border-[#33332d] rounded-xl px-[13px] pt-[9px] pb-2.5 shadow-[0_16px_38px_-10px_rgba(0,0,0,.55)]"
      style={{ animation: "tzPop .13s ease both" }}
    >
      <span className="w-[9px] h-[9px] rounded-[3px] shrink-0 bg-brand-yellow" />
      <div className="flex flex-col gap-px">
        <span className="text-[11px] font-semibold uppercase tracking-[.03em] text-brand-muted-2">
          {label} · sesiones
        </span>
        <span className="font-display font-extrabold text-lg leading-[1.05] text-white">
          {Number(item.value) || 0}
        </span>
      </div>
    </div>
  );
}

export default function ActivityChart({ data }: { data: { label: string; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const bestIdx = data.reduce((best, d, i) => (d.count > data[best].count ? i : best), 0);

  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.gridline} vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} className="capitalize" />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={30} domain={[0, maxCount + 2]} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <ActivityTooltip {...props} />} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={46} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i || i === bestIdx ? BRAND.yellow : BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="count"
            position="top"
            style={{ fill: INK.secondary, fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

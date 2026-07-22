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
  ComposedChart,
  Area,
  Line,
  Cell,
  LabelList,
  PieChart,
  Pie,
  type TooltipContentProps,
} from "recharts";
import {
  BRAND,
  INK,
  MEMBER_STATE_COLOR,
  MEMBER_STATE_LABEL,
  PAYMENT_METHOD_COLOR,
  PAYMENT_METHOD_LABEL,
  CATEGORICAL,
} from "@/lib/chart-colors";

const axisStyle = { fontSize: 12, fontWeight: 600, fill: INK.muted };
const gridProps = { stroke: INK.gridline, vertical: false };

function TzTooltip({
  active,
  payload,
  unit,
  metric,
}: TooltipContentProps & { unit?: "€" | "%" | ""; metric: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const raw = Number(item.value) || 0;
  const formatted =
    unit === "€"
      ? `${Math.round(raw).toLocaleString("es-ES")} €`
      : unit === "%"
      ? `${Math.round(raw)}%`
      : Math.round(raw).toLocaleString("es-ES");
  const payloadData = item.payload as { dotColor?: string; label?: string } | undefined;
  const color = payloadData?.dotColor ?? (item.color as string) ?? "#D8CCB8";
  const name = payloadData?.label ?? item.name;

  return (
    <div
      className="flex items-center gap-2.5 bg-brand-ink border border-[#33332d] rounded-xl px-[13px] pt-[9px] pb-2.5 shadow-[0_16px_38px_-10px_rgba(0,0,0,.55)]"
      style={{ animation: "tzPop .13s ease both" }}
    >
      <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ background: color }} />
      <div className="flex flex-col gap-px">
        <span className="text-[11px] font-semibold uppercase tracking-[.03em] text-brand-muted-2">
          {name} · {metric}
        </span>
        <span className="font-display font-extrabold text-lg leading-[1.05] text-white">
          {formatted}
        </span>
      </div>
    </div>
  );
}

function useHover() {
  const [active, setActive] = useState<number | null>(null);
  return { active, setActive };
}

export function RevenueByMonthChart({
  data,
}: {
  data: { month: Date; totalEuros: number }[];
}) {
  const { active, setActive } = useHover();
  const rows = data.map((d, i) => ({
    label: new Date(d.month).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
    total: Math.round(d.totalEuros),
    isLast: i === data.length - 1,
  }));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={rows} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={44} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="ingresos" unit="€" />} />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={52} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {rows.map((r, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i || r.isLast ? BRAND.yellow : BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="total"
            position="top"
            formatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            style={{ fill: INK.secondary, fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MemberStateChart({
  data,
}: {
  data: { state: string; count: number }[];
}) {
  const { active, setActive } = useHover();
  const order = ["ACTIVE", "DELINQUENT", "FROZEN", "TRIAL", "PROSPECT", "CANCELLED"];
  const rows = order
    .map((s) => data.find((d) => d.state === s))
    .filter((d): d is { state: string; count: number } => !!d)
    .map((d) => ({ label: MEMBER_STATE_LABEL[d.state], count: d.count, state: d.state }));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} width={80} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="socios" unit="" />} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {rows.map((r, i) => (
            <Cell
              key={r.state}
              cursor="pointer"
              fill={MEMBER_STATE_COLOR[r.state]}
              opacity={active !== null && active !== i ? 0.4 : 1}
              style={{ filter: active === i ? "brightness(1.12)" : "none" }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            style={{ fill: INK.primary, fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyByCenterChart({
  data,
}: {
  data: { center: string; occupancyPct: number; sessions: number }[];
}) {
  const { active, setActive } = useHover();
  const maxIdx = data.reduce((best, d, i) => (d.occupancyPct > (data[best]?.occupancyPct ?? -1) ? i : best), 0);
  const rows = data.map((d) => ({ ...d, label: d.center.replace(/^TRAINING ZONE\s*/i, "") }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} unit="%" />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="ocupación" unit="%" />} />
        <Bar dataKey="occupancyPct" radius={[6, 6, 0, 0]} maxBarSize={64} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {rows.map((_, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i || i === maxIdx ? BRAND.yellow : BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="occupancyPct"
            position="top"
            formatter={(v) => `${Number(v)}%`}
            style={{ fill: INK.secondary, fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyByWeekdayChart({
  data,
}: {
  data: { day: string; occupancyPct: number }[];
}) {
  const { active, setActive } = useHover();
  const short = data.map((d) => ({ ...d, label: d.day.slice(0, 3) }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={short} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} unit="%" />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="ocupación" unit="%" />} />
        <Bar dataKey="occupancyPct" radius={[6, 6, 0, 0]} maxBarSize={30} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {short.map((_, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i ? BRAND.yellow : BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NoShowRateCard({ rate }: { rate: number }) {
  return (
    <div
      className="relative overflow-hidden bg-brand-ink rounded-2xl p-[22px] flex flex-col justify-between h-full tz-fade-up"
      style={{ animationDelay: "0.36s" }}
    >
      <h3 className="relative z-10 font-display font-extrabold text-base uppercase text-white">
        Tasa de no-show <span className="font-sans font-semibold text-xs normal-case text-[#8a8a80]">· 30 días</span>
      </h3>
      <div className="relative z-10">
        <div className="font-display font-extrabold text-[76px] leading-none text-tz-linen">{rate}%</div>
        <p className="text-[13px] text-brand-muted-2 mt-2 max-w-[200px]">
          de las reservas confirmadas no se presentaron
        </p>
      </div>
      <div className="absolute -right-10 -bottom-10 w-[180px] h-[180px] rounded-full bg-brand-ink-circle" />
    </div>
  );
}

export function RetentionCohortChart({
  data,
}: {
  data: { month: string; total: number; retainedPct: number }[];
}) {
  const { active, setActive } = useHover();
  const rows = data.map((d) => ({ ...d, label: d.month }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} onMouseLeave={() => setActive(null)}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} unit="%" domain={[0, 100]} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="retención" unit="%" />} />
        <Area
          type="monotone"
          dataKey="retainedPct"
          stroke="none"
          fill={BRAND.yellow}
          fillOpacity={0.18}
          isAnimationActive
          animationDuration={800}
          animationBegin={500}
        />
        <Line
          type="monotone"
          dataKey="retainedPct"
          stroke={BRAND.ink}
          strokeWidth={2.5}
          isAnimationActive
          animationDuration={1100}
          animationEasing="ease"
          dot={(props: { cx?: number; cy?: number; index?: number }) => {
            const i = props.index ?? 0;
            const isHover = active === i;
            return (
              <circle
                key={i}
                cx={props.cx}
                cy={props.cy}
                r={isHover ? 6.5 : 4.5}
                fill={isHover ? BRAND.ink : BRAND.yellow}
                stroke={BRAND.ink}
                strokeWidth={2}
                cursor="pointer"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
            );
          }}
          activeDot={{ r: 6.5, fill: BRAND.ink, stroke: BRAND.ink }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function AgeBracketsChart({
  data,
}: {
  data: { bracket: string; count: number }[];
}) {
  const { active, setActive } = useHover();
  const maxIdx = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? -1) ? i : best), 0);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="bracket" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={32} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="socios" unit="" />} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i || i === maxIdx ? BRAND.yellow : BRAND.inkSoft}
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

/** BI-1: donut categórico (servicio/canal) — paleta monocromática de marca, identidad siempre reforzada con leyenda directa. */
export function DonutChart({
  data,
  metric,
}: {
  data: { label: string; value: number }[];
  metric: string;
}) {
  const { active, setActive } = useHover();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const rows = data.map((d, i) => ({ ...d, dotColor: CATEGORICAL[i % CATEGORICAL.length] }));

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <ResponsiveContainer width={170} height={170} className="shrink-0">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            innerRadius={50}
            outerRadius={76}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
            isAnimationActive
            animationDuration={700}
          >
            {rows.map((r, i) => (
              <Cell
                key={r.label}
                fill={r.dotColor}
                cursor="pointer"
                opacity={active !== null && active !== i ? 0.35 : 1}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </Pie>
          <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric={metric} unit="" />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 w-full space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-2 cursor-pointer"
            style={{ opacity: active !== null && active !== i ? 0.5 : 1 }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex items-center gap-2 text-text-2 capitalize">
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: r.dotColor }} />
              {r.label}
            </span>
            <span className="tz-nums font-semibold text-brand-text shrink-0">
              {r.value} · {Math.round((r.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** BI-1: top N socios por dimensión seleccionada (RB-BI-011). */
export function MemberRankingChart({
  data,
  dimension,
}: {
  data: { memberName: string; ltvEuros: number; adherencePct: number; tenureDays: number; mixedScore: number }[];
  dimension: "mixed" | "ltv" | "adherence" | "tenure";
}) {
  const { active, setActive } = useHover();
  const valueOf = (d: (typeof data)[number]) =>
    dimension === "ltv" ? d.ltvEuros : dimension === "adherence" ? d.adherencePct : dimension === "tenure" ? d.tenureDays : d.mixedScore;
  const unit = dimension === "ltv" ? "€" : dimension === "adherence" ? "%" : "";
  const metric = dimension === "ltv" ? "LTV" : dimension === "adherence" ? "adherencia" : dimension === "tenure" ? "antigüedad (días)" : "score";
  const rows = data.slice(0, 8).map((d) => ({ label: d.memberName, value: Math.round(valueOf(d)) }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 40, left: 10, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} width={120} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric={metric} unit={unit as "€" | "%" | ""} />} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {rows.map((_, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i || i === 0 ? BRAND.yellow : BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v) => `${v}${unit}`}
            style={{ fill: INK.primary, fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** BI-1: ranking de servicios por altas o por ingresos (una sola métrica por eje, el toggle cambia cuál). */
export function TopServicesChart({
  data,
  orderBy,
}: {
  data: { name: string; subscriptionsCount: number; revenueEuros: number }[];
  orderBy: "count" | "revenue";
}) {
  const { active, setActive } = useHover();
  const rows = data.map((d) => ({
    label: d.name,
    value: orderBy === "revenue" ? Math.round(d.revenueEuros) : d.subscriptionsCount,
  }));
  const unit = orderBy === "revenue" ? ("€" as const) : ("" as const);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 46, left: 10, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} width={110} />
        <Tooltip
          cursor={false}
          content={(props: TooltipContentProps) => <TzTooltip {...props} metric={orderBy === "revenue" ? "ingresos" : "altas"} unit={unit} />}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {rows.map((_, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={active === i || i === 0 ? BRAND.yellow : BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v) => `${Number(v).toLocaleString("es-ES")}${unit}`}
            style={{ fill: INK.primary, fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueByMethodChart({
  data,
}: {
  data: { method: string; totalEuros: number }[];
}) {
  const { active, setActive } = useHover();
  const rows = data
    .map((d) => ({ label: PAYMENT_METHOD_LABEL[d.method] ?? d.method, total: Math.round(d.totalEuros), method: d.method }))
    .sort((a, b) => b.total - a.total);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 46, left: 10, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} width={100} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="ingresos" unit="€" />} />
        <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive animationDuration={700} animationEasing="ease-out">
          {rows.map((r, i) => (
            <Cell
              key={r.method}
              cursor="pointer"
              fill={PAYMENT_METHOD_COLOR[r.method] ?? BRAND.inkSoft}
              opacity={active !== null && active !== i ? 0.4 : 1}
              style={{ filter: active === i ? "brightness(1.15)" : "none" }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList
            dataKey="total"
            position="right"
            formatter={(v) => `${(Number(v) / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k €`}
            style={{ fill: INK.primary, fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Semi Condensed'" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

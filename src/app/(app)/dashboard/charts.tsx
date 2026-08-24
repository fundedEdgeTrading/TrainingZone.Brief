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
  PieChart,
  Pie,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import { INK, SERIES, CATEGORICAL } from "@/lib/chart-colors";

const axisStyle = { fontSize: 11.5, fontWeight: 600, fill: INK.muted };
const gridProps = { stroke: INK.gridline, vertical: false };
const labelStyle = { fontSize: 12.5, fontWeight: 700 };

/** Miles con un decimal y coma decimal: `18,4k`. */
const kFormat = (v: number) => `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}k`;

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
  const color = payloadData?.dotColor ?? (item.color as string) ?? "var(--color-tz-linen)";
  const name = payloadData?.label ?? item.name;

  return (
    <div
      className="flex items-center gap-2.5 bg-brand-ink border border-brand-border-dark rounded-xl px-[13px] pt-[9px] pb-2.5 shadow-[0_16px_38px_-10px_rgba(0,0,0,.55)]"
      style={{ animation: "tzPop .13s ease both" }}
    >
      <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ background: color }} />
      <div className="flex flex-col gap-px">
        <span className="text-[11px] font-semibold uppercase tracking-[.03em] text-brand-muted-2">
          {name} · {metric}
        </span>
        <span className="font-display font-bold text-lg leading-[1.05] text-white">{formatted}</span>
      </div>
    </div>
  );
}

function useHover() {
  const [active, setActive] = useState<number | null>(null);
  return { active, setActive };
}

/**
 * Tick del eje X que puede destacar uno de los valores. Lo usan la ocupación
 * por día (el pico) y la retención (el mes más reciente): el rótulo del dato
 * que hay que mirar va en 700 y con el color del acento, no solo la barra.
 */
function highlightTick(highlighted: string, color: string) {
  // El tipo se declara "hacia arriba" (todo opcional) para que encaje con lo
  // que Recharts pasa realmente al render del tick sin arrastrar su tipo entero.
  return function Tick(props: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) {
    const value = String(props.payload?.value ?? "");
    const on = value === highlighted;
    return (
      <text
        x={props.x}
        y={props.y}
        dy={12}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={on ? 700 : 600}
        fill={on ? color : INK.muted}
      >
        {value}
      </text>
    );
  };
}

/* ---------- Dinero ---------- */

export function RevenueChart({
  data,
  average,
}: {
  data: { label: string; totalEuros: number; isCurrent: boolean }[];
  average: number;
}) {
  const { active, setActive } = useHover();
  const rows = data.map((d) => ({
    label: d.label,
    total: Math.round(d.totalEuros),
    isCurrent: d.isCurrent,
    // Dos etiquetas y no una: `LabelList` no sabe de índices, así que el color
    // por barra se consigue con una lista por color y el hueco en blanco.
    labelCurrent: d.isCurrent ? kFormat(d.totalEuros) : "",
    labelOther: d.isCurrent ? "" : kFormat(d.totalEuros),
  }));

  return (
    <ResponsiveContainer width="100%" height={236}>
      <BarChart data={rows} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={44} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="ingresos" unit="€" />} />
        {/* La media del periodo: sin ella una barra alta no dice si es buena. */}
        <ReferenceLine y={Math.round(average)} stroke={SERIES.goldSoft} strokeDasharray="6 4" strokeWidth={2} />
        <Bar dataKey="total" radius={[7, 7, 0, 0]} maxBarSize={54} isAnimationActive animationDuration={700} animationBegin={200} animationEasing="ease-out">
          {rows.map((r, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={r.isCurrent ? SERIES.gold : SERIES.linen}
              opacity={active !== null && active !== i ? 0.45 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList dataKey="labelCurrent" position="top" style={{ ...labelStyle, fill: SERIES.gold }} />
          <LabelList dataKey="labelOther" position="top" style={{ ...labelStyle, fill: INK.muted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Ocupación ---------- */

export function OccupancyByWeekdayChart({
  data,
}: {
  data: { day: string; occupancyPct: number }[];
}) {
  const { active, setActive } = useHover();
  const peak = data.reduce((best, d, i) => (d.occupancyPct > (data[best]?.occupancyPct ?? -1) ? i : best), 0);
  const rows = data.map((d, i) => ({
    ...d,
    label: d.day.slice(0, 3),
    // Domingo y sábado: fin de semana, la serie más tenue.
    weekend: i === 0 || i === 6,
    peakLabel: i === peak ? `${d.occupancyPct}%` : "",
  }));
  const peakLabel = rows[peak]?.label ?? "";
  // El eje llega hasta 80% salvo que algún día lo pase: con el tope fijo, un
  // martes al 95% se salía del lienzo en vez de crecer la escala.
  const top = Math.max(80, Math.ceil(Math.max(0, ...data.map((d) => d.occupancyPct)) / 20) * 20);

  return (
    <ResponsiveContainer width="100%" height={186}>
      <BarChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={highlightTick(peakLabel, SERIES.gold)} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} unit="%" ticks={[0, top / 2, top]} domain={[0, top]} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="ocupación" unit="%" />} />
        <Bar dataKey="occupancyPct" radius={[7, 7, 0, 0]} maxBarSize={30} isAnimationActive animationDuration={700} animationBegin={200} animationEasing="ease-out">
          {rows.map((r, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={i === peak ? SERIES.gold : r.weekend ? INK.gridline : SERIES.sand}
              opacity={active !== null && active !== i ? 0.45 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList dataKey="peakLabel" position="top" style={{ fontSize: 12, fontWeight: 700, fill: SERIES.gold }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NoShowRateCard({ rate, deltaPts }: { rate: number; deltaPts: number | null }) {
  return (
    <div
      className="relative overflow-hidden bg-brand-ink rounded-[18px] p-[22px] flex flex-col justify-between h-full tz-fade-up"
      style={{ animationDelay: "0.36s" }}
    >
      <h3 className="relative z-10 font-display font-bold text-base uppercase text-white">
        Tasa de no-show <span className="font-sans font-semibold text-xs normal-case text-brand-muted-2">· 30 días</span>
      </h3>
      <div className="relative z-10">
        <div className="flex items-end gap-2.5">
          <span className="font-display font-bold text-[72px] leading-none tracking-[-.03em] text-apta-gold tz-nums">
            {rate}%
          </span>
          {deltaPts !== null && deltaPts !== 0 && (
            // Chip dorado sobre oscuro: se usan los tokens `gold-bg`/`gold`, que
            // se invierten con el tema igual que la propia card oscura.
            <span className="mb-2 rounded-pill bg-gold-bg text-gold px-2 py-[3px] text-[11px] font-bold tabular-nums">
              {deltaPts > 0 ? "↑" : "↓"} {Math.abs(deltaPts)} pts
            </span>
          )}
        </div>
        <p className="text-[13px] text-brand-muted-2 mt-2 max-w-[220px]">
          de las reservas confirmadas no se presentaron
        </p>
      </div>
      {/* El círculo decorativo iba al mismo tono que el fondo y no se veía.
          `white` es un token que se invierte con el tema, así que un 6 % sobre
          la card oscura la aclara en claro y la oscurece en oscuro. */}
      <div className="absolute -right-12 -bottom-12 w-[190px] h-[190px] rounded-full bg-white/[0.06]" />
    </div>
  );
}

/* ---------- Altas y bajas por semana ---------- */

export function WeeklyChurnChart({
  data,
}: {
  data: { label: string; joins: number; cancels: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={186}>
      <BarChart data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }} barGap={4}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="socios" unit="" />} />
        <Bar dataKey="joins" name="altas" fill={SERIES.gold} radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive animationDuration={700} animationBegin={200} />
        <Bar dataKey="cancels" name="bajas" fill={SERIES.critical} radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive animationDuration={700} animationBegin={280} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Demografía ---------- */

export function AgeBracketsChart({
  data,
}: {
  data: { bracket: string; count: number }[];
}) {
  const { active, setActive } = useHover();
  const maxIdx = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? -1) ? i : best), 0);
  const rows = data.map((d, i) => {
    const distance = Math.abs(i - maxIdx);
    return {
      ...d,
      // La franja dominante y sus dos vecinas son "el cuerpo" de la muestra; el
      // resto son colas y se pintan en el tono más tenue.
      tier: distance === 0 ? "peak" : distance === 1 ? "mid" : "tail",
      labelPeak: i === maxIdx ? String(d.count) : "",
      labelMid: distance === 1 ? String(d.count) : "",
      labelTail: distance > 1 ? String(d.count) : "",
    };
  });
  const fill = { peak: SERIES.gold, mid: SERIES.sand, tail: INK.gridline } as const;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="bracket"
          tick={highlightTick(rows[maxIdx]?.bracket ?? "", SERIES.gold)}
          axisLine={{ stroke: INK.baseline }}
          tickLine={false}
        />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip cursor={false} content={(props: TooltipContentProps) => <TzTooltip {...props} metric="socios" unit="" />} />
        <Bar dataKey="count" radius={[7, 7, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={700} animationBegin={200} animationEasing="ease-out">
          {rows.map((r, i) => (
            <Cell
              key={i}
              cursor="pointer"
              fill={fill[r.tier as keyof typeof fill]}
              opacity={active !== null && active !== i ? 0.45 : 1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
          <LabelList dataKey="labelPeak" position="top" style={{ fontSize: 12, fontWeight: 700, fill: SERIES.gold }} />
          <LabelList dataKey="labelMid" position="top" style={{ fontSize: 12, fontWeight: 700, fill: INK.secondary }} />
          <LabelList dataKey="labelTail" position="top" style={{ fontSize: 12, fontWeight: 700, fill: INK.muted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** BI-1: donut categórico (servicio/canal), con leyenda directa y el total al centro. */
export function DonutChart({
  data,
  metric,
  size = 150,
  showTotal = false,
  totalLabel,
}: {
  data: { label: string; value: number }[];
  metric: string;
  size?: number;
  /** Cifra grande en el hueco del donut: el total de la serie. */
  showTotal?: boolean;
  totalLabel?: string;
}) {
  const { active, setActive } = useHover();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const rows = data.map((d, i) => ({ ...d, dotColor: CATEGORICAL[i % CATEGORICAL.length] }));
  const outer = size / 2 - 6;
  const inner = outer - 26;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width={size} height={size}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius={inner}
              outerRadius={outer}
              paddingAngle={2}
              stroke="var(--color-brand-card)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={700}
              animationBegin={150}
              startAngle={90}
              endAngle={-270}
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
        {showTotal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-display font-bold text-2xl leading-none text-brand-text tz-nums">{total}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[1px] text-brand-muted mt-1">
              {totalLabel ?? metric}
            </span>
          </div>
        )}
      </div>
      <ul className="flex-1 w-full space-y-[7px] text-[13px]">
        {rows.map((r, i) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-2 cursor-pointer"
            style={{ opacity: active !== null && active !== i ? 0.5 : 1 }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex items-center gap-2 min-w-0 text-brand-text-2 capitalize">
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: r.dotColor }} />
              <span className="truncate">{r.label}</span>
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

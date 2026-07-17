"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Cell,
  LabelList,
} from "recharts";
import { CATEGORICAL, INK, MEMBER_STATE_COLOR, MEMBER_STATE_LABEL, PAYMENT_METHOD_COLOR, PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";

const axisStyle = { fontSize: 12, fill: INK.muted };
const gridProps = { stroke: INK.gridline, vertical: false };

export function RevenueByMonthChart({
  data,
}: {
  data: { month: Date; totalEuros: number }[];
}) {
  const rows = data.map((d) => ({
    label: new Date(d.month).toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
    total: Math.round(d.totalEuros),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={50} />
        <Tooltip
          formatter={(v) => [`${Number(v).toLocaleString("es-ES")} €`, "Ingresos"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${INK.gridline}` }}
        />
        <Bar dataKey="total" fill={CATEGORICAL.blue} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MemberStateChart({
  data,
}: {
  data: { state: string; count: number }[];
}) {
  const order = ["ACTIVE", "DELINQUENT", "FROZEN", "TRIAL", "PROSPECT", "CANCELLED"];
  const rows = order
    .map((s) => data.find((d) => d.state === s))
    .filter(Boolean)
    .map((d) => ({ label: MEMBER_STATE_LABEL[d!.state], count: d!.count, state: d!.state }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} width={80} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${INK.gridline}` }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r) => (
            <Cell key={r.state} fill={MEMBER_STATE_COLOR[r.state]} />
          ))}
          <LabelList dataKey="count" position="right" style={{ fill: INK.secondary, fontSize: 12 }} />
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
  const colors = [CATEGORICAL.blue, CATEGORICAL.green, CATEGORICAL.orange];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="center" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={40} unit="%" />
        <Tooltip
          formatter={(v) => [`${Number(v)}%`, "Ocupación"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${INK.gridline}` }}
        />
        <Bar dataKey="occupancyPct" radius={[4, 4, 0, 0]} maxBarSize={60}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
          <LabelList dataKey="occupancyPct" position="top" formatter={(v) => `${Number(v)}%`} style={{ fill: INK.secondary, fontSize: 12 }} />
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
  const short = data.map((d) => ({ ...d, label: d.day.slice(0, 3) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={short} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={40} unit="%" />
        <Tooltip
          formatter={(v) => [`${Number(v)}%`, "Ocupación"]}
          labelFormatter={(_, entry) => (entry?.[0]?.payload as { day?: string } | undefined)?.day ?? ""}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${INK.gridline}` }}
        />
        <Bar dataKey="occupancyPct" fill={CATEGORICAL.aqua} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RetentionCohortChart({
  data,
}: {
  data: { month: string; total: number; retainedPct: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" tick={axisStyle} axisLine={{ stroke: INK.baseline }} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={40} unit="%" domain={[0, 100]} />
        <Tooltip
          formatter={(v) => [`${Number(v)}%`, "Retenidos"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${INK.gridline}` }}
        />
        <Line type="monotone" dataKey="retainedPct" stroke={CATEGORICAL.blue} strokeWidth={2} dot={{ r: 4, fill: CATEGORICAL.blue }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenueByMethodChart({
  data,
}: {
  data: { method: string; totalEuros: number }[];
}) {
  const rows = data
    .map((d) => ({ label: PAYMENT_METHOD_LABEL[d.method] ?? d.method, total: Math.round(d.totalEuros), method: d.method }))
    .sort((a, b) => b.total - a.total);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} layout="vertical" margin={{ top: 10, right: 40, left: 10, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} width={100} />
        <Tooltip
          formatter={(v) => [`${Number(v).toLocaleString("es-ES")} €`, "Ingresos"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${INK.gridline}` }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r) => (
            <Cell key={r.method} fill={PAYMENT_METHOD_COLOR[r.method] ?? CATEGORICAL.blue} />
          ))}
          <LabelList dataKey="total" position="right" formatter={(v) => `${Number(v).toLocaleString("es-ES")} €`} style={{ fill: INK.secondary, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

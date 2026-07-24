type Row = { label: string; count: number };

/** Gráfica de barras horizontales ordenada desc por conteo (canales de origen / motivos de no cierre). */
export function DistributionChart({ rows, gradient, valueColor }: { rows: Row[]; gradient: string; valueColor: string }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));

  if (rows.length === 0) return <p className="text-sm text-brand-muted">Sin datos todavía.</p>;

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-[104px] shrink-0 text-[12.5px] font-medium text-brand-text-2 truncate">{r.label}</span>
          <div className="flex-1 h-3.5 rounded-pill bg-brand-bg overflow-hidden">
            <div
              className="h-full rounded-pill transition-[width] duration-500 ease-out-soft"
              style={{ width: `${(r.count / max) * 100}%`, background: gradient }}
            />
          </div>
          <span className="w-[70px] shrink-0 text-right text-xs tz-nums">
            <span className="font-bold" style={{ color: valueColor }}>
              {r.count}
            </span>
            <span className="text-faint"> · {total ? Math.round((r.count / total) * 100) : 0}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

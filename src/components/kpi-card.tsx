export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warning" | "critical";
}) {
  const toneClasses = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warning: "text-amber-700",
    critical: "text-red-700",
  }[tone];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneClasses}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

type Tone = "default" | "good" | "warning" | "critical" | "accent";

const STRIPE_COLOR: Record<Tone, string> = {
  default: "#d8ccb8",
  good: "#4b5a22",
  warning: "#8a5a12",
  critical: "#8a3420",
  accent: "#1d1d1c",
};

const TEXT_CLASS: Record<Tone, string> = {
  default: "text-brand-text",
  good: "text-good",
  warning: "text-warning-text",
  critical: "text-critical",
  accent: "text-brand-text",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  size?: "md" | "lg";
  delay?: number;
}) {
  return (
    <div
      className="relative overflow-hidden bg-brand-card border border-brand-border rounded-[14px] pt-4 px-4 pb-3.5 tz-fade-up transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,.25)] hover:border-brand-border-hover"
      style={{ animationDelay: `${delay}s` }}
    >
      <span
        className="absolute top-0 left-0 w-[3px] h-full"
        style={{ background: STRIPE_COLOR[tone] }}
      />
      <div className="font-display font-bold text-[10px] tracking-[.1em] uppercase text-brand-muted">
        {label}
      </div>
      <div
        className={`font-display font-extrabold leading-none tracking-[-.02em] tabular-nums whitespace-nowrap mt-2 ${TEXT_CLASS[tone]} ${
          size === "lg" ? "text-[28px]" : "text-[22px]"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-brand-muted-2 mt-1 min-h-[14px]">{hint}</div>
    </div>
  );
}

export function Card({
  title,
  meta,
  action,
  delay = 0,
  dark = false,
  children,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  delay?: number;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl p-[22px] tz-fade-up ${
        dark ? "bg-brand-ink" : "bg-brand-card border border-brand-border"
      }`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-baseline justify-between mb-5 gap-2">
        <h3
          className={`font-display font-extrabold text-base uppercase tracking-[.01em] ${
            dark ? "text-white" : "text-brand-text"
          }`}
        >
          {title}
          {meta && (
            <span className="ml-2 font-sans font-semibold text-xs normal-case text-brand-muted tracking-normal">
              · {meta}
            </span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

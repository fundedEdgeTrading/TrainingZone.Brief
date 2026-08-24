import { CountUp, type CountUpFormat } from "@/components/ui/count-up";

type Tone = "default" | "good" | "warning" | "critical" | "accent" | "gold";

/**
 * Acento del tile en el panel de dirección (rediseño 2026-08). Manda sobre
 * `tone`: pinta el filete izquierdo **y** la cifra, que es lo que hace que la
 * fila de ocho KPIs se lea de un vistazo en vez de como ocho cajas iguales.
 */
type Accent = "gold" | "ink" | "critical" | "muted";

const STRIPE_COLOR: Record<Tone, string> = {
  default: "var(--color-brand-border)",
  good: "var(--color-good)",
  warning: "var(--color-warning)",
  critical: "var(--color-critical)",
  accent: "var(--color-brand-ink)",
  gold: "var(--color-apta-gold)",
};

const TEXT_CLASS: Record<Tone, string> = {
  default: "text-brand-text",
  good: "text-good",
  warning: "text-warning-text",
  critical: "text-critical",
  accent: "text-brand-text",
  gold: "text-brand-text",
};

const ACCENT_COLOR: Record<Accent, string> = {
  gold: "var(--color-gold)",
  ink: "var(--color-brand-ink)",
  critical: "var(--color-critical)",
  muted: "var(--color-brand-text-2)",
};

const ACCENT_TEXT_CLASS: Record<Accent, string> = {
  gold: "text-gold",
  ink: "text-brand-text",
  critical: "text-critical",
  muted: "text-brand-text-2",
};

/** Chip de comparativa contra el periodo anterior. */
export type KpiDelta = { text: string; tone: "good" | "bad" | "flat" };

const DELTA_CLASS: Record<KpiDelta["tone"], string> = {
  good: "bg-gold-bg text-gold",
  bad: "bg-critical-bg text-critical",
  flat: "bg-brand-bg text-brand-muted",
};

const VALUE_SIZE: Record<"md" | "lg" | "kpi" | "ltv", string> = {
  md: "text-[22px]",
  lg: "text-[28px]",
  kpi: "text-[27px]",
  ltv: "text-[25px]",
};

/**
 * Sparkline de la métrica: siete puntos, el último marcado. Es un SVG plano
 * calculado en servidor —sin librería y sin estado— porque solo tiene que
 * enseñar la forma de la serie, no permitir interacción.
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * 62 + 2, 20 - ((v - min) / span) * 16] as const);
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width="66" height="24" viewBox="0 0 66 24" aria-hidden="true" className="flex-none overflow-visible opacity-85">
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="2.6" fill={color} />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  numericValue,
  format,
  hint,
  footer,
  tone = "default",
  accent,
  delta,
  spark,
  size = "md",
  delay = 0,
}: {
  label: string;
  /** Valor ya formateado. Se usa tal cual si no se pasa `numericValue`. */
  value: string;
  /**
   * Si se pasa, la cifra cuenta de 0 a este número al montar. La card sigue
   * siendo un Server Component: solo la cifra es cliente (`CountUp`).
   */
  numericValue?: number;
  /** Cómo se pinta la cifra en curso (ver `CountUpFormat`). */
  format?: CountUpFormat;
  hint?: string;
  footer?: React.ReactNode;
  tone?: Tone;
  /** Rediseño del panel: color del filete y de la cifra. Tiene prioridad sobre `tone`. */
  accent?: Accent;
  /** Chip de variación contra el periodo anterior. `null`/ausente = sin chip. */
  delta?: KpiDelta | null;
  /** Serie corta de la métrica, a la derecha de la cifra. */
  spark?: number[];
  size?: "md" | "lg" | "kpi" | "ltv";
  delay?: number;
}) {
  const stripe = accent ? ACCENT_COLOR[accent] : STRIPE_COLOR[tone];
  const valueClass = accent ? ACCENT_TEXT_CLASS[accent] : TEXT_CLASS[tone];

  return (
    <div
      className="relative overflow-hidden bg-brand-card border border-brand-border rounded-2xl pt-[15px] px-4 pb-[13px] tz-fade-up transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:shadow-hover hover:border-brand-border-hover"
      style={{ animationDelay: `${delay}s` }}
    >
      <span className="absolute top-0 left-0 w-[3px] h-full" style={{ background: stripe }} />
      <div className="flex items-start justify-between gap-2">
        <div className="font-display font-bold text-[10px] tracking-[.1em] uppercase text-brand-muted leading-[1.4]">
          {label}
        </div>
        {delta && (
          <span
            className={`flex-none rounded-pill px-[7px] py-0.5 text-[10.5px] font-bold tabular-nums ${DELTA_CLASS[delta.tone]}`}
          >
            {delta.text}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2.5 mt-2.5">
        <div
          className={`font-display font-bold leading-none tracking-[-.025em] tabular-nums whitespace-nowrap ${valueClass} ${VALUE_SIZE[size]}`}
        >
          {numericValue != null ? (
            <CountUp value={numericValue} delay={delay * 1000} format={format} />
          ) : (
            value
          )}
        </div>
        {spark && <Sparkline values={spark} color={stripe} />}
      </div>
      {footer ?? <div className="text-[11px] text-brand-muted-2 mt-1.5 min-h-[14px]">{hint}</div>}
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
      <div className="flex flex-wrap items-baseline justify-between mb-5 gap-2">
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

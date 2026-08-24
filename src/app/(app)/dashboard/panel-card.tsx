/**
 * Piezas de composición del panel de dirección (rediseño 2026-08).
 *
 * La `Card` compartida de `@/components/kpi-card` la usan media docena de
 * pantallas más, así que el panel no la retoca: aquí vive su variante, con el
 * radio de 18 px, la cabecera de dos alturas y la meta partida en trozos que
 * pedía el rediseño. Todo son componentes sin estado —ni hooks ni eventos— así
 * que sirven igual dentro de un Server Component o de uno de cliente.
 *
 * Las barras horizontales de todo el panel salen de `BarRow`/`BarBlock`. Nunca
 * animan `width`: el ancho queda fijo al valor final y lo que se anima es
 * `scaleX` con `origin-left` (`tzGrow`), como manda el plan §0.6.
 */
import { SERIES } from "@/lib/chart-colors";

const TITLE_SIZE = {
  /** El mapa de calor, que abre zona. */
  lg: "text-[17px]",
  /** El resto de cards del panel. */
  md: "text-base",
  /** Zona "Quién es nuestro socio": un punto menos, es la de menor prioridad. */
  sm: "text-[15px]",
} as const;

export function PanelCard({
  title,
  meta,
  action,
  footer,
  delay = 0,
  size = "md",
  children,
}: {
  title: string;
  /** Va detrás del título, en minúscula y precedido de "·". */
  meta?: string;
  action?: React.ReactNode;
  /** Pie separado por un filete, para la frase que explica la gráfica. */
  footer?: React.ReactNode;
  delay?: number;
  size?: keyof typeof TITLE_SIZE;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col bg-brand-card border border-brand-border rounded-[18px] p-[22px] h-full tz-fade-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 gap-x-3.5 mb-[18px]">
        <h3
          className={`font-display font-bold uppercase tracking-[.01em] text-brand-text ${TITLE_SIZE[size]}`}
        >
          {title}
          {meta && (
            <span className="ml-2 font-sans font-semibold text-xs normal-case tracking-normal text-brand-muted">
              · {meta}
            </span>
          )}
        </h3>
        {action}
      </div>
      <div className="flex-1">{children}</div>
      {footer && (
        <div className="border-t border-tz-sand pt-3.5 mt-[18px] text-[11.5px] leading-[1.5] text-brand-muted">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Separador de zona. Cinco en la página, uno por bloque de lectura. El filete
 * de 22 px va en degradado dorado salvo en la última zona ("Quién es nuestro
 * socio"), que lo lleva plano: es la de menor prioridad y el dorado no debe
 * premiarla.
 */
export function ZoneDivider({ label, plain = false }: { label: string; plain?: boolean }) {
  return (
    <div className="flex items-center gap-3 mt-3.5">
      <span
        className="w-[22px] h-0.5 rounded-sm"
        style={{
          background: plain
            ? "var(--color-brand-border)"
            : "linear-gradient(90deg, var(--color-apta-gold), var(--color-gold))",
        }}
      />
      <span className="font-display font-bold text-[10.5px] tracking-[.18em] uppercase text-brand-muted">{label}</span>
      <span className="flex-1 h-px bg-brand-border" />
    </div>
  );
}

/** Leyenda de una serie: cuadrado de color + etiqueta. */
export function LegendSwatch({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-muted whitespace-nowrap">
      <span
        className={line ? "w-[14px] h-[2px] rounded-sm" : "w-2.5 h-2.5 rounded-[3px]"}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

/** Fila etiqueta + pista + valor. La usan método de pago, estados, embudo y nicho. */
export function BarRow({
  label,
  labelWidth,
  pct,
  color,
  value,
  valueWidth,
  valueColor,
  height = 18,
  rounded = "rounded-r-md",
  delay = 0.2,
}: {
  label: string;
  labelWidth: number;
  /** 0-100. */
  pct: number;
  color: string;
  value: string;
  valueWidth: number;
  valueColor?: string;
  height?: number;
  rounded?: string;
  delay?: number;
}) {
  return (
    <div className="flex items-center gap-3 text-[12.5px]">
      <span className="flex-none font-semibold text-brand-text-2 truncate" style={{ width: labelWidth }}>
        {label}
      </span>
      <div
        className={`flex-1 bg-brand-bg overflow-hidden ${rounded}`}
        style={{ height }}
      >
        <div
          className={`h-full origin-left ${rounded}`}
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: color,
            animation: `tzGrow .8s var(--ease-out-soft) ${delay.toFixed(2)}s both`,
          }}
        />
      </div>
      <span
        className="flex-none text-right font-bold tabular-nums"
        style={{ width: valueWidth, color: valueColor ?? "var(--color-brand-text)" }}
      >
        {value}
      </span>
    </div>
  );
}

/** Bloque nombre + valor sobre pista, para rankings cortos (servicios, ocupación por centro). */
export function BarBlock({
  label,
  value,
  pct,
  color,
  valueColor,
  height = 8,
  delay = 0.2,
  labelSize = "text-[12.5px]",
  valueSize = "text-[13px]",
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  valueColor?: string;
  height?: number;
  delay?: number;
  labelSize?: string;
  valueSize?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className={`font-semibold text-brand-text truncate ${labelSize}`}>{label}</span>
        <span
          className={`font-bold tabular-nums shrink-0 ${valueSize}`}
          style={{ color: valueColor ?? "var(--color-brand-text)" }}
        >
          {value}
        </span>
      </div>
      <div className="rounded-pill bg-brand-bg overflow-hidden" style={{ height }}>
        <div
          className="h-full rounded-pill origin-left"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: color,
            // El toggle Altas/Ingresos reordena y el ancho tiene que verse
            // cambiar, no saltar: por eso la transición además de la entrada.
            transition: "width .45s var(--ease-out-soft)",
            animation: `tzGrow .8s var(--ease-out-soft) ${delay.toFixed(2)}s both`,
          }}
        />
      </div>
    </div>
  );
}

/** Colores de las cinco etapas del embudo, de más frío a cierre. */
export const FUNNEL_COLORS = [SERIES.faint, SERIES.sand, SERIES.ink, SERIES.gold, SERIES.critical];

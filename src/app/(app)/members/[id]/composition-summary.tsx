import type { RangeStatus } from "@/lib/reference-ranges";

const STATUS_DOT: Record<RangeStatus, string> = {
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
  unknown: "bg-faint",
};

type Tile = { label: string; value: string | null; status?: RangeStatus };

// CC1.4/CC2 (docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md): tarjetas de la última toma con
// semáforo contra el rango de referencia (docs/COMPOSICION_CORPORAL_TANITA.md §3).
export function CompositionSummary({ tiles, measuredAt }: { tiles: Tile[]; measuredAt: string | null }) {
  const withValue = tiles.filter((t) => t.value != null);
  if (withValue.length === 0) return null;

  return (
    <div className="border border-tz-linen rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
        <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">
          Última toma de composición corporal
        </div>
        {measuredAt && <span className="text-xs text-faint">{measuredAt}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {withValue.map((t) => (
          <div key={t.label} className="rounded-lg bg-tz-bone border border-tz-linen p-3.5">
            <div className="flex items-center gap-1.5 mb-1">
              {t.status && <span className={`w-2 h-2 rounded-full ${STATUS_DOT[t.status]}`} />}
              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-brand-muted">{t.label}</span>
            </div>
            <div className="font-display font-extrabold text-lg text-tz-black tz-nums">{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

import type { AlignmentCategory } from "@/lib/feedback-queries";

// Barra de alineación cliente vs. entrenador (0-10). Posición horizontal de un
// valor `v`: `4 + v/10*92` (%) — igual en el listado y en el desglose por
// dimensión del detalle. Sin feedback del cliente → solo marcador de
// entrenador, sin relleno de gap ni marcador de cliente.
const GAP_FILL_CLASS: Record<"ciego" | "cliente_positivo" | "alineado", string> = {
  ciego: "bg-critical/50",
  cliente_positivo: "bg-good/50",
  alineado: "bg-apta-gold/60",
};

function trackPosition(v: number) {
  return 4 + (v / 10) * 92;
}

export function AlignmentTrack({
  clientValue,
  trainerValue,
  cat,
}: {
  clientValue: number | null;
  trainerValue: number | null;
  cat: AlignmentCategory;
}) {
  const trainerLeft = trainerValue != null ? trackPosition(trainerValue) : null;
  const clientLeft = clientValue != null ? trackPosition(clientValue) : null;
  const gapLeft = clientLeft != null && trainerLeft != null ? Math.min(clientLeft, trainerLeft) : null;
  const gapWidth = clientLeft != null && trainerLeft != null ? Math.max(Math.abs(trainerLeft - clientLeft), 1.5) : null;

  return (
    <div className="relative flex-1 h-[34px] min-w-[64px] sm:min-w-[110px]">
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded-pill bg-brand-bg" />
      {gapLeft != null && gapWidth != null && cat !== "sin_feedback" && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-[6px] rounded-pill ${GAP_FILL_CLASS[cat]}`}
          style={{ left: `${gapLeft}%`, width: `${gapWidth}%` }}
        />
      )}
      {clientLeft != null && (
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-brand-ink border-2 border-white z-[3]"
          style={{
            left: `${clientLeft}%`,
            transform: "translate(-50%,-50%)",
            boxShadow: "0 0 0 1px var(--color-tz-linen), 0 2px 6px -2px rgba(29,29,28,.5)",
          }}
        />
      )}
      {trainerLeft != null && (
        <div
          className="absolute top-1/2 w-3 h-3 bg-apta-gold border-2 border-white z-[2]"
          style={{
            left: `${trainerLeft}%`,
            transform: "translate(-50%,-50%) rotate(45deg)",
            boxShadow: "0 0 0 1px var(--color-gold), 0 2px 6px -2px rgba(29,29,28,.5)",
          }}
        />
      )}
    </div>
  );
}

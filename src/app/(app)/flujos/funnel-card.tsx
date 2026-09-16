import { Badge } from "@/components/ui/badge";
import type { FlowFunnel } from "@/lib/flows/panel";

/**
 * E14-29 · EL ARMAZÓN DEL PANEL POR FLUJO. Tres cifras: **entran**, **hacen
 * clic**, **cumplen el objetivo**.
 *
 * NO HAY TASA DE APERTURA, y no por olvido: medirla exige un píxel de traza, y
 * con él un CMP con «rechazar todo» al mismo nivel visual que «aceptar todo» en
 * el mismo cambio. La decisión está tomada para la fase 1 — si alguien pregunta
 * por la apertura, la respuesta es el clic.
 *
 * LA TERCERA CIFRA ES UN HUECO TIPADO. Qué objetivo lleva cada flujo y cómo se
 * mide lo define E3 registrando su resolutor (`registerFlowGoalResolver`).
 * Mientras no lo haya, la tarjeta dice «falta definir cómo se mide» en vez de
 * pintar un cero: un cero y un «no se sabe» no son lo mismo, y confundirlos es
 * peor que no enseñar la cifra.
 */
export function FunnelCard({ funnel }: { funnel: FlowFunnel }) {
  const clickRate = funnel.emailed > 0 ? Math.round((funnel.clicked / funnel.emailed) * 100) : null;

  return (
    <section className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card space-y-3" data-testid="flow-funnel">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">Embudo</h2>
        <span className="text-[12px] text-brand-muted">
          No se mide la apertura: el enlace es nuestro, así que lo que se mide es el clic.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Entran" value={funnel.entered} help="Socios que han entrado en el flujo, hayan terminado o no." />
        <Metric
          label="Hacen clic"
          value={funnel.clicked}
          help={
            clickRate === null
              ? "Todavía no ha salido ningún correo de verdad."
              : `${clickRate}% de los ${funnel.emailed} que recibieron algo.`
          }
        />
        {funnel.goalKind ? (
          <Metric
            label={funnel.goalLabel ?? "Objetivo"}
            value={funnel.goalPending ? null : funnel.goalMet}
            help={
              funnel.goalPending
                ? "Falta definir cómo se mide este objetivo."
                : (funnel.goalDefinition ?? "")
            }
          />
        ) : (
          <Metric label="Objetivo" value={null} help="Este flujo no declara objetivo." />
        )}
      </div>

      <p className="text-[12px] text-brand-muted">
        {funnel.sent} {funnel.sent === 1 ? "correo ha salido" : "correos han salido"} de verdad
        {funnel.sentTest > 0 && ` y ${funnel.sentTest} al buzón de pruebas`}.{" "}
        {funnel.goalPending && (
          <Badge tone="warning" dot={false}>
            Objetivo sin medir
          </Badge>
        )}
      </p>
    </section>
  );
}

function Metric({ label, value, help }: { label: string; value: number | null; help: string }) {
  return (
    <div className="rounded-card border border-brand-border p-3">
      <div className="font-display font-bold text-[10px] tracking-[.16em] uppercase text-brand-muted">{label}</div>
      <div className="tz-nums text-2xl font-bold mt-1">{value === null ? "—" : value}</div>
      <p className="text-[12px] text-brand-muted mt-1">{help}</p>
    </div>
  );
}

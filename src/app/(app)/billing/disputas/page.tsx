import Link from "next/link";
import type { DisputeStatus } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { centerScopeFor } from "@/lib/center-scope";
import { listDisputes, stripeDisputeUrl, type DisputeListItem } from "@/lib/stripe-disputes";
import { stripeReadClient } from "@/lib/billing-shared";
import { Card, KpiCard } from "@/components/kpi-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function fecha(date: Date | null) {
  return date ? date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

const STATUS_LABEL: Record<DisputeStatus, string> = {
  NEEDS_RESPONSE: "Sin responder",
  UNDER_REVIEW: "En revisión",
  WON: "Ganada",
  LOST: "Perdida",
};

const STATUS_TONE: Record<DisputeStatus, BadgeTone> = {
  NEEDS_RESPONSE: "critical",
  UNDER_REVIEW: "warning",
  WON: "good",
  LOST: "critical",
};

/** Días que quedan para la fecha límite de evidencia. Negativo = ya pasó. */
function diasRestantes(dueBy: Date | null, ahora: Date) {
  if (!dueBy) return null;
  return Math.ceil((dueBy.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000));
}

function Plazo({ dispute, ahora }: { dispute: DisputeListItem; ahora: Date }) {
  if (dispute.closedAt) return <span className="text-brand-muted">—</span>;
  if (!dispute.evidenceDueBy) {
    return <span className="text-brand-muted">El banco no admite respuesta</span>;
  }
  const dias = diasRestantes(dispute.evidenceDueBy, ahora)!;
  if (dias < 0) {
    return <span className="text-critical font-semibold">Plazo vencido ({fecha(dispute.evidenceDueBy)})</span>;
  }
  return (
    <span className={dias <= 3 ? "text-critical font-semibold" : "text-brand-text"}>
      {fecha(dispute.evidenceDueBy)}
      <span className="ml-1.5 text-[11px] text-brand-muted">
        {dias === 0 ? "hoy" : dias === 1 ? "queda 1 día" : `quedan ${dias} días`}
      </span>
    </span>
  );
}

/**
 * HU-ST-21 · Disputas y contracargos visibles (decisión D-S7).
 *
 * Una disputa es dinero que ya salió con un reloj en marcha: pasada la fecha de
 * `evidence_details.due_by` sin responder, se pierde sola. Hasta ahora eso solo
 * se veía entrando al Dashboard de Stripe, que es como decir que no se veía; la
 * primera noticia era el descuadre del mes siguiente.
 *
 * **Aportar evidencia enlaza al Dashboard de Stripe.** Apta no se encarga de la
 * subida en esta fase (D-S7): lo que aporta es que la disputa aparezca a tiempo,
 * con su importe y su plazo, delante de quien tiene que decidir.
 *
 * Solo dirección, y solo las disputas de sus centros: la consulta sale de
 * `centerScopeFor`, igual que el resto de Cobros.
 */
export default async function DisputasPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);

  const scope = await centerScopeFor(session.user);
  const [disputes, client] = await Promise.all([
    listDisputes(session.user.orgId, scope ?? undefined),
    stripeReadClient(session.user.orgId),
  ]);

  const ahora = new Date();
  const abiertas = disputes.filter((d) => !d.closedAt);
  const perdidas = disputes.filter((d) => d.status === "LOST");
  const enRiesgoCents = abiertas.reduce((total, d) => total + d.amountCents, 0);

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        kicker="Cobros · Disputas"
        description="Contracargos abiertos por el banco del socio, con su importe y la fecha límite para responder. En esta fase la evidencia se aporta desde el Dashboard de Stripe (D-S7): Apta enlaza, no sube los ficheros."
        actions={
          <>
            <Link href="/billing" className="text-xs text-faint hover:text-tz-black transition-colors duration-150">
              ← Cobros
            </Link>
            <Link href="/billing/reembolsos" className="text-xs text-faint hover:text-tz-black transition-colors duration-150">
              Devoluciones
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Disputas abiertas" value={String(abiertas.length)} tone={abiertas.length ? "critical" : "default"} delay={0.04} />
        <KpiCard label="Importe en juego" value={euros(enRiesgoCents)} tone={enRiesgoCents ? "warning" : "default"} delay={0.1} />
        <KpiCard label="Perdidas" value={String(perdidas.length)} tone={perdidas.length ? "critical" : "default"} delay={0.16} />
      </div>

      <Card title="Disputas" meta={`${disputes.length}`}>
        {disputes.length === 0 ? (
          <p className="text-sm text-brand-muted">
            No hay ninguna disputa en tus centros. Cuando el banco de un socio abra una, aparecerá aquí y dirección
            recibirá una tarea con su fecha límite.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[.08em] text-brand-muted">
                  <th className="py-2 pr-3 font-bold">Socio</th>
                  <th className="py-2 pr-3 font-bold text-right">Importe</th>
                  <th className="py-2 pr-3 font-bold">Motivo del banco</th>
                  <th className="py-2 pr-3 font-bold">Estado</th>
                  <th className="py-2 pr-3 font-bold">Responder antes de</th>
                  <th className="py-2 font-bold text-right">Evidencia</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((dispute) => (
                  <tr key={dispute.id} className="border-t border-brand-border/60">
                    <td className="py-2 pr-3">
                      <Link href={`/members/${dispute.payment.member.id}`} className="hover:underline">
                        {dispute.payment.member.firstName} {dispute.payment.member.lastName}
                      </Link>
                      <div className="text-[11px] text-brand-muted">Cobro del {fecha(dispute.payment.date)}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{euros(dispute.amountCents)}</td>
                    <td className="py-2 pr-3 text-brand-muted">{dispute.reason ?? "sin especificar"}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_TONE[dispute.status]} dot={false}>
                        {STATUS_LABEL[dispute.status]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <Plazo dispute={dispute} ahora={ahora} />
                    </td>
                    <td className="py-2 text-right">
                      {dispute.closedAt ? (
                        <span className="text-xs text-brand-muted">Cerrada el {fecha(dispute.closedAt)}</span>
                      ) : client.ok ? (
                        <a
                          href={stripeDisputeUrl(client.accountId, dispute.stripeDisputeId, client.livemode)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-brand-text-2 border border-brand-border rounded-lg px-3 py-1.5 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink inline-block"
                        >
                          Aportar en Stripe ↗
                        </a>
                      ) : (
                        <span className="text-xs text-brand-muted">{client.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

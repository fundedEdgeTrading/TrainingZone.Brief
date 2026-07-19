import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { Card, KpiCard } from "@/components/kpi-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import AlertActions from "./alert-actions";

const RISK_CLASS: Record<string, string> = {
  HIGH: "bg-critical-bg border-tz-linen",
  MEDIUM: "bg-warning-bg border-tz-linen",
  LOW: "bg-tz-bone border-tz-linen",
};
const RISK_TONE: Record<string, BadgeTone> = { HIGH: "critical", MEDIUM: "warning", LOW: "neutral" };
const RISK_LABEL: Record<string, string> = { HIGH: "ALTA", MEDIUM: "MEDIA", LOW: "BAJA" };

export default async function RetentionPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  const alerts = await prisma.retentionAlert.findMany({
    where: { member: { orgId: session.user.orgId } },
    include: { member: { include: { primaryCenter: true } } },
    orderBy: [{ status: "asc" }, { riskLevel: "asc" }, { dropPct: "asc" }],
  });

  const open = alerts.filter((a) => a.status === "OPEN");
  const highRisk = open.filter((a) => a.riskLevel === "HIGH");

  // Regla de diseño (G.3): máximo 3 alertas por entrenador y semana para no saturar.
  const capped = open.slice(0, 3);
  const overflow = open.length - capped.length;

  const estimatedAnnualSaving = open.length * 3 * 45 * 12;

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        description="Caída de frecuencia respecto a la línea base personal del socio (G.3). Recuperar 3 socios/mes a 45€ son ~1.620€/año por centro — la señal con mayor ROI directo de la plataforma."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Alertas abiertas" value={String(open.length)} tone={open.length ? "warning" : "default"} delay={0.04} />
        <KpiCard label="Riesgo alto" value={String(highRisk.length)} tone={highRisk.length ? "critical" : "default"} delay={0.1} />
        <KpiCard
          label="Ahorro potencial estimado"
          value={estimatedAnnualSaving.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          hint="si se recuperan 3 socios/mes a 45€"
          tone="good"
          delay={0.16}
        />
        <KpiCard label="Histórico total" value={String(alerts.length)} delay={0.22} />
      </div>

      <Card title="Prioridad de esta semana" meta="máx. 3 por entrenador — regla anti-saturación" delay={0.12}>
        <div className="space-y-3">
          {capped.map((a) => (
            <div
              key={a.id}
              className={`rounded-card border p-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-hover ${RISK_CLASS[a.riskLevel]}`}
            >
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/members/${a.member.id}`} className="font-semibold text-tz-black hover:underline">
                      {a.member.firstName} {a.member.lastName}
                    </Link>
                    <Badge tone={RISK_TONE[a.riskLevel]}>Riesgo {RISK_LABEL[a.riskLevel]}</Badge>
                  </div>
                  <p className="text-sm text-text-2 mt-2 flex items-center gap-2 flex-wrap">
                    <span className="tz-nums">Línea base: {a.baselineFreq.toFixed(1)}/semana</span>
                    <span aria-hidden>→</span>
                    <span className="tz-nums">Últimas 2 semanas: {a.recentFreq.toFixed(1)}/semana</span>
                    <Badge tone="critical" dot={false}>
                      -{a.dropPct}%
                    </Badge>
                  </p>
                  {a.context && <p className="text-xs text-muted mt-1">{a.context}</p>}
                  <p className="text-xs text-faint mt-1">{a.member.primaryCenter.name}</p>
                </div>
                <AlertActions alertId={a.id} status={a.status} />
              </div>
            </div>
          ))}
          {capped.length === 0 && <p className="text-sm text-muted">Sin alertas abiertas ahora mismo.</p>}
        </div>
      </Card>

      {overflow > 0 && (
        <Card title="En cola" meta={`${overflow} — se mostrarán la próxima semana`} delay={0.18}>
          <div className="space-y-2">
            {open.slice(3).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-t border-tz-sand pt-2">
                <Link href={`/members/${a.member.id}`} className="text-tz-black hover:underline">
                  {a.member.firstName} {a.member.lastName}
                </Link>
                <span className="text-xs text-muted tz-nums">{RISK_LABEL[a.riskLevel]} · {a.dropPct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Histórico de alertas" delay={0.24}>
        <table className="w-full text-sm">
          <thead className="text-xs text-faint text-left">
            <tr>
              <th className="pb-2">Socio</th>
              <th className="pb-2">Riesgo</th>
              <th className="pb-2">Caída</th>
              <th className="pb-2">Creada</th>
              <th className="pb-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-t border-tz-sand">
                <td className="py-2">
                  <Link href={`/members/${a.member.id}`} className="text-tz-black hover:underline">
                    {a.member.firstName} {a.member.lastName}
                  </Link>
                </td>
                <td className="py-2">{RISK_LABEL[a.riskLevel]}</td>
                <td className="py-2 tz-nums">{a.dropPct}%</td>
                <td className="py-2 text-muted tz-nums">{a.createdAt.toLocaleDateString("es-ES")}</td>
                <td className="py-2 text-muted">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { Card, KpiCard } from "@/components/kpi-card";
import AlertActions from "./alert-actions";

const RISK_CLASS: Record<string, string> = {
  HIGH: "bg-red-50 border-red-200",
  MEDIUM: "bg-amber-50 border-amber-200",
  LOW: "bg-slate-50 border-slate-200",
};
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Motor de retención</h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Caída de frecuencia respecto a la línea base personal del socio (G.3).
          Recuperar 3 socios/mes a 45€ son ~1.620€/año por centro — la señal con
          mayor ROI directo de la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Alertas abiertas" value={String(open.length)} tone={open.length ? "warning" : "default"} />
        <KpiCard label="Riesgo alto" value={String(highRisk.length)} tone={highRisk.length ? "critical" : "default"} />
        <KpiCard
          label="Ahorro potencial estimado"
          value={estimatedAnnualSaving.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          hint="si se recuperan 3 socios/mes a 45€"
          tone="good"
        />
        <KpiCard label="Histórico total" value={String(alerts.length)} />
      </div>

      <Card title={`Prioridad de esta semana (máx. 3 por entrenador — regla anti-saturación)`}>
        <div className="space-y-3">
          {capped.map((a) => (
            <div key={a.id} className={`rounded-lg border p-4 ${RISK_CLASS[a.riskLevel]}`}>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <Link href={`/members/${a.member.id}`} className="font-semibold text-slate-900 hover:underline">
                    {a.member.firstName} {a.member.lastName}
                  </Link>
                  <span className="ml-2 text-xs font-medium uppercase text-slate-500">
                    Riesgo {RISK_LABEL[a.riskLevel]}
                  </span>
                  <p className="text-sm text-slate-600 mt-1">
                    Línea base: {a.baselineFreq.toFixed(1)} sesiones/semana · Últimas 2 semanas:{" "}
                    {a.recentFreq.toFixed(1)}/semana{" "}
                    <span className="font-semibold text-red-700">({a.dropPct}%)</span>
                  </p>
                  {a.context && <p className="text-xs text-slate-500 mt-1">{a.context}</p>}
                  <p className="text-xs text-slate-400 mt-1">{a.member.primaryCenter.name}</p>
                </div>
                <AlertActions alertId={a.id} status={a.status} />
              </div>
            </div>
          ))}
          {capped.length === 0 && <p className="text-sm text-slate-500">Sin alertas abiertas ahora mismo.</p>}
        </div>
      </Card>

      {overflow > 0 && (
        <Card title={`En cola (${overflow}) — se mostrarán la próxima semana`}>
          <div className="space-y-2">
            {open.slice(3).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-t border-slate-100 pt-2">
                <Link href={`/members/${a.member.id}`} className="text-indigo-700 hover:underline">
                  {a.member.firstName} {a.member.lastName}
                </Link>
                <span className="text-xs text-slate-500">{RISK_LABEL[a.riskLevel]} · {a.dropPct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Histórico de alertas">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400 text-left">
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
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2">
                  <Link href={`/members/${a.member.id}`} className="text-indigo-700 hover:underline">
                    {a.member.firstName} {a.member.lastName}
                  </Link>
                </td>
                <td className="py-2">{RISK_LABEL[a.riskLevel]}</td>
                <td className="py-2">{a.dropPct}%</td>
                <td className="py-2 text-slate-500">{a.createdAt.toLocaleDateString("es-ES")}</td>
                <td className="py-2 text-slate-500">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

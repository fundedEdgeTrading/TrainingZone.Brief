import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getTrainerPanelData } from "@/lib/trainer-panel-queries";
import { KpiCard, Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function TrainerPanelPage() {
  const session = await requireRole(["TRAINER"]);
  const data = await getTrainerPanelData(session.user.orgId, session.user.id);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="RB-RRHH-005: tus clientes de EP, horas de EP y de grupos realizadas este mes." />

      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Horas EP este mes" value={`${data.epHours}h`} delay={0.04} />
        <KpiCard label="Horas de grupos este mes" value={`${data.groupHours}h`} delay={0.1} />
      </div>

      <Card title="Mis clientes de EP" meta={`${data.epClients.length} activos`}>
        {data.epClients.length === 0 ? (
          <EmptyState title="Sin clientes de EP" description="Todavía no tienes clientes de Personal Training asignados." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-faint text-left">
              <tr>
                <th className="pb-2">Cliente</th>
                <th className="pb-2">Servicio</th>
                <th className="pb-2">Sesiones asistidas (histórico)</th>
              </tr>
            </thead>
            <tbody>
              {data.epClients.map((c) => (
                <tr key={c.id} className="border-t border-tz-sand">
                  <td className="py-2">
                    <Link href={`/members/${c.id}`} className="text-brand-text font-semibold hover:underline">
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="py-2 text-brand-text-2">{c.planNames || "—"}</td>
                  <td className="py-2 tz-nums">{c.attendedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

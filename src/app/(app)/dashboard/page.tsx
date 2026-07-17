import { requireRole } from "@/lib/guard";
import {
  getKpis,
  getRevenueByMonth,
  getMemberStateBreakdown,
  getOccupancyByCenter,
  getNoShowRate,
  getOccupancyByWeekday,
  getCohortRetention,
  getRevenueByMethod,
} from "@/lib/dashboard-queries";
import { KpiCard, Card } from "@/components/kpi-card";
import {
  RevenueByMonthChart,
  MemberStateChart,
  OccupancyByCenterChart,
  OccupancyByWeekdayChart,
  RetentionCohortChart,
  RevenueByMethodChart,
} from "./charts";

export default async function DashboardPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const orgId = session.user.orgId;

  const [kpis, revenueByMonth, stateBreakdown, occupancyByCenter, noShowRate, occupancyByWeekday, cohorts, revenueByMethod] =
    await Promise.all([
      getKpis(orgId),
      getRevenueByMonth(orgId),
      getMemberStateBreakdown(orgId),
      getOccupancyByCenter(orgId),
      getNoShowRate(orgId),
      getOccupancyByWeekday(orgId),
      getCohortRetention(orgId),
      getRevenueByMethod(orgId),
    ]);

  const eur = (cents: number) =>
    (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Panel de control</h1>
        <p className="text-sm text-slate-500">
          Sergio abre una pantalla y sabe cómo va el mes (F5).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Socios activos" value={String(kpis.activeMembers)} />
        <KpiCard label="Morosos" value={String(kpis.delinquent)} tone={kpis.delinquent > 0 ? "critical" : "default"} />
        <KpiCard label="Congelados" value={String(kpis.frozen)} tone="warning" />
        <KpiCard label="Ingresos del mes" value={eur(kpis.monthRevenueCents)} tone="good" />
        <KpiCard label="Sesiones este mes" value={String(kpis.sessionsThisMonth)} />
        <KpiCard
          label="Alertas de retención"
          value={String(kpis.openAlerts)}
          tone={kpis.openAlerts > 0 ? "warning" : "default"}
          hint="abiertas, ver módulo Retención"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Ingresos por mes (últimos 6 meses)">
          <RevenueByMonthChart data={revenueByMonth} />
        </Card>
        <Card title="Socios por estado">
          <MemberStateChart data={stateBreakdown} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Ocupación por centro (30 días)">
          <OccupancyByCenterChart data={occupancyByCenter} />
        </Card>
        <Card title="Ocupación por día de la semana (60 días)">
          <OccupancyByWeekdayChart data={occupancyByWeekday} />
        </Card>
        <Card title="Tasa de no-show (30 días)">
          <div className="flex flex-col items-center justify-center h-[220px]">
            <div className={`text-5xl font-bold ${noShowRate > 15 ? "text-red-600" : "text-slate-800"}`}>
              {noShowRate}%
            </div>
            <p className="text-sm text-slate-500 mt-2 text-center">
              de las reservas confirmadas no se presentaron
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Retención por cohorte de alta (% aún activos)">
          <RetentionCohortChart data={cohorts} />
        </Card>
        <Card title="Ingresos por método de pago (histórico)">
          <RevenueByMethodChart data={revenueByMethod} />
        </Card>
      </div>
    </div>
  );
}

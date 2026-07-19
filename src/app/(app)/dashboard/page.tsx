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
  NoShowRateCard,
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
    <div className="max-w-[1240px] mx-auto flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <KpiCard label="Socios activos" value={String(kpis.activeMembers)} delay={0.04} />
        <KpiCard
          label="Morosos"
          value={String(kpis.delinquent)}
          tone={kpis.delinquent > 0 ? "critical" : "default"}
          hint={kpis.delinquent > 0 ? "recibos fallidos" : ""}
          delay={0.1}
        />
        <KpiCard label="Congelados" value={String(kpis.frozen)} tone="warning" delay={0.16} />
        <KpiCard label="Ingresos del mes" value={eur(kpis.monthRevenueCents)} tone="good" delay={0.22} />
        <KpiCard label="Sesiones este mes" value={String(kpis.sessionsThisMonth)} delay={0.28} />
        <KpiCard
          label="Alertas de retención"
          value={String(kpis.openAlerts)}
          tone={kpis.openAlerts > 0 ? "warning" : "default"}
          hint="ver módulo Retención"
          delay={0.34}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card title="Ingresos por mes" meta="Últimos 6 meses" delay={0.12}>
          <RevenueByMonthChart data={revenueByMonth} />
        </Card>
        <Card title="Socios por estado" delay={0.18}>
          <MemberStateChart data={stateBreakdown} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.85fr] gap-4">
        <Card title="Ocupación por centro" meta="30 días" delay={0.24}>
          <OccupancyByCenterChart data={occupancyByCenter} />
        </Card>
        <Card title="Ocupación por día" meta="60 días" delay={0.3}>
          <OccupancyByWeekdayChart data={occupancyByWeekday} />
        </Card>
        <NoShowRateCard rate={noShowRate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Retención por cohorte" meta="% aún activos por mes de alta" delay={0.42}>
          <RetentionCohortChart data={cohorts} />
        </Card>
        <Card title="Ingresos por método de pago" delay={0.48}>
          <RevenueByMethodChart data={revenueByMethod} />
        </Card>
      </div>
    </div>
  );
}

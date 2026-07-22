import Link from "next/link";
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
  getLtvAndTicket,
  getMemberDemographics,
  getGoalsAggregate,
  getPostalCodeDistribution,
  getAgeBrackets,
  getMembersByService,
  getAcquisitionChannels,
  getTopServices,
  getMemberRanking,
  getLeadCloseRate,
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
  AgeBracketsChart,
  DonutChart,
  MemberRankingChart,
  TopServicesChart,
} from "./charts";

const RANKING_DIMENSION_LABEL: Record<string, string> = {
  mixed: "Mixto",
  ltv: "LTV",
  adherence: "Adherencia",
  tenure: "Antigüedad",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ servicesOrderBy?: string; rankingDimension?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const orgId = session.user.orgId;
  const params = await searchParams;
  const servicesOrderBy = params.servicesOrderBy === "revenue" ? "revenue" : "count";
  const rankingDimension = (["mixed", "ltv", "adherence", "tenure"].includes(params.rankingDimension ?? "")
    ? params.rankingDimension
    : "mixed") as "mixed" | "ltv" | "adherence" | "tenure";

  const [
    kpis,
    revenueByMonth,
    stateBreakdown,
    occupancyByCenter,
    noShowRate,
    occupancyByWeekday,
    cohorts,
    revenueByMethod,
    ltvTicket,
    demographics,
    goalsAggregate,
    postalDistribution,
    ageBrackets,
    membersByService,
    acquisitionChannels,
    topServices,
    memberRanking,
    leadCloseRate,
  ] = await Promise.all([
    getKpis(orgId),
    getRevenueByMonth(orgId),
    getMemberStateBreakdown(orgId),
    getOccupancyByCenter(orgId),
    getNoShowRate(orgId),
    getOccupancyByWeekday(orgId),
    getCohortRetention(orgId),
    getRevenueByMethod(orgId),
    getLtvAndTicket(orgId),
    getMemberDemographics(orgId),
    getGoalsAggregate(orgId),
    getPostalCodeDistribution(orgId),
    getAgeBrackets(orgId),
    getMembersByService(orgId),
    getAcquisitionChannels(orgId),
    getTopServices(orgId, { orderBy: servicesOrderBy }),
    getMemberRanking(orgId, { dimension: rankingDimension }),
    getLeadCloseRate(orgId),
  ]);
  const maxPostal = Math.max(1, ...postalDistribution.map((p) => p.total));
  const maxFunnel = Math.max(1, ...Object.values(leadCloseRate.funnel));

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KpiCard label="LTV medio por cliente" value={eur(ltvTicket.ltvEuros * 100)} hint={`${ltvTicket.payingMembers} clientes con cobros`} tone="good" delay={0.5} />
        <KpiCard label="Ticket medio" value={eur(ltvTicket.avgTicketEuros * 100)} delay={0.54} />
        <KpiCard label="Edad media" value={demographics.avgAge ? `${demographics.avgAge} años` : "—"} delay={0.58} />
        <KpiCard
          label="% con hijos / empresarios"
          value={`${demographics.pctWithChildren ?? "—"}% / ${demographics.pctBusinessOwners ?? "—"}%`}
          delay={0.62}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Nicho principal (ocupación)" meta={`muestra: ${demographics.sampleSize}`} delay={0.56}>
          {demographics.topOccupations.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin datos de ocupación todavía.</p>
          ) : (
            <ul className="space-y-2">
              {demographics.topOccupations.map((o) => (
                <li key={o.occupation} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-brand-text-2">{o.occupation}</span>
                  <span className="tz-nums font-semibold text-brand-text">{o.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Objetivos (agregado)" meta="RB-BI-004" delay={0.6}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="font-display font-extrabold text-xl text-brand-text tz-nums">
                {goalsAggregate.achievedGoals}/{goalsAggregate.totalGoals}
              </div>
              <div className="text-brand-muted">Objetivos conseguidos</div>
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-brand-text tz-nums">{goalsAggregate.checkins}</div>
              <div className="text-brand-muted">Check-ins recibidos</div>
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-critical tz-nums">{goalsAggregate.stalledCount}</div>
              <div className="text-brand-muted">Se sienten estancados</div>
            </div>
            <div>
              <div className="font-display font-extrabold text-xl text-good tz-nums">{goalsAggregate.wantsMoreCount}</div>
              <div className="text-brand-muted">Piden &quot;más&quot;</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Franjas de edad" meta={`muestra: ${demographics.sampleSize}`} delay={0.66}>
          <AgeBracketsChart data={ageBrackets} />
        </Card>
        <Card title="Canal de origen" meta="RB-BI-008 — todos los leads" delay={0.7}>
          {acquisitionChannels.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin leads registrados todavía.</p>
          ) : (
            <DonutChart data={acquisitionChannels.map((c) => ({ label: c.channel, value: c.count }))} metric="leads" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1fr_1fr] gap-4">
        <Card title="Embudo de leads" meta={leadCloseRate.closeRatePct != null ? `${leadCloseRate.closeRatePct}% de cierre` : "sin decisiones"} delay={0.74}>
          <div className="space-y-2">
            {(
              [
                ["Sin contactar", leadCloseRate.funnel.sinContactar],
                ["Seguimiento", leadCloseRate.funnel.seguimiento],
                ["Con fecha valoración", leadCloseRate.funnel.conFechaValoracion],
                ["Cerrado", leadCloseRate.funnel.cerrado],
                ["No cerrado", leadCloseRate.funnel.noCerrado],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="flex items-center gap-2.5 text-sm">
                <span className="w-32 shrink-0 text-text-2">{label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-tz-sand overflow-hidden">
                  <div className="h-full bg-tz-black rounded-full" style={{ width: `${(count / maxFunnel) * 100}%` }} />
                </div>
                <span className="w-6 shrink-0 text-xs text-brand-muted text-right tz-nums">{count}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Socios por servicio" meta="RB-BI-007 — suscripciones activas" delay={0.78}>
          {membersByService.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin suscripciones activas todavía.</p>
          ) : (
            <DonutChart data={membersByService.map((s) => ({ label: s.name, value: s.count }))} metric="socios" />
          )}
        </Card>
        <Card
          title="Servicio más vendido"
          meta="RB-BI-010"
          delay={0.82}
          action={
            <div className="flex gap-1 text-xs">
              {(
                [
                  ["count", "Altas"],
                  ["revenue", "Ingresos"],
                ] as const
              ).map(([value, label]) => (
                <Link
                  key={value}
                  href={`/dashboard?servicesOrderBy=${value}${params.rankingDimension ? `&rankingDimension=${params.rankingDimension}` : ""}`}
                  className={`px-2 py-1 rounded-md transition-colors duration-150 ${
                    servicesOrderBy === value ? "bg-tz-sand text-tz-black font-semibold" : "text-muted hover:bg-tz-sand"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          }
        >
          {topServices.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin planes configurados todavía.</p>
          ) : (
            <TopServicesChart data={topServices} orderBy={servicesOrderBy} />
          )}
        </Card>
      </div>

      <Card
        title="Ranking de socios"
        meta="RB-BI-011 — LTV, adherencia y antigüedad"
        delay={0.86}
        action={
          <div className="flex gap-1 text-xs">
            {(Object.keys(RANKING_DIMENSION_LABEL) as (keyof typeof RANKING_DIMENSION_LABEL)[]).map((dim) => (
              <Link
                key={dim}
                href={`/dashboard?rankingDimension=${dim}${params.servicesOrderBy ? `&servicesOrderBy=${params.servicesOrderBy}` : ""}`}
                className={`px-2 py-1 rounded-md transition-colors duration-150 ${
                  rankingDimension === dim ? "bg-tz-sand text-tz-black font-semibold" : "text-muted hover:bg-tz-sand"
                }`}
              >
                {RANKING_DIMENSION_LABEL[dim]}
              </Link>
            ))}
          </div>
        }
      >
        {memberRanking.length === 0 ? (
          <p className="text-sm text-brand-muted">Sin socios activos todavía.</p>
        ) : (
          <div className="space-y-5">
            <MemberRankingChart data={memberRanking} dimension={rankingDimension} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-faint text-left">
                  <tr>
                    <th className="pb-2">Socio</th>
                    <th className="pb-2">LTV</th>
                    <th className="pb-2">Adherencia</th>
                    <th className="pb-2">Antigüedad</th>
                    <th className="pb-2">Score mixto</th>
                  </tr>
                </thead>
                <tbody>
                  {memberRanking.map((m) => (
                    <tr key={m.memberId} className="border-t border-tz-sand">
                      <td className="py-2">{m.memberName}</td>
                      <td className="py-2 tz-nums">{eur(m.ltvEuros * 100)}</td>
                      <td className="py-2 tz-nums">{m.adherencePct}%</td>
                      <td className="py-2 tz-nums text-text-2">{m.tenureDays} d</td>
                      <td className="py-2 tz-nums font-semibold">{m.mixedScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Distribución geográfica (leads + clientes)"
        meta="por prefijo de código postal — proxy del mapa de radios (RB-LEAD-010)"
        delay={0.64}
      >
        {postalDistribution.length === 0 ? (
          <p className="text-sm text-brand-muted">Sin códigos postales registrados todavía.</p>
        ) : (
          <div className="space-y-2">
            {postalDistribution.slice(0, 10).map((p) => (
              <div key={p.prefix} className="flex items-center gap-3 text-sm">
                <span className="w-10 shrink-0 font-semibold text-brand-text tz-nums">{p.prefix}xxx</span>
                <div className="flex-1 h-3 rounded-full bg-tz-sand overflow-hidden">
                  <div className="h-full bg-tz-black rounded-full" style={{ width: `${(p.total / maxPostal) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-xs text-brand-muted text-right">
                  {p.leads} leads · {p.members} clientes
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

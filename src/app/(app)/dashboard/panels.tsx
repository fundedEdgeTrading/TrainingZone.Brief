/**
 * Paneles del panel de control.
 *
 * El panel hacía las 19 consultas en un único `Promise.all`, así que la página
 * no pintaba hasta que terminaba la más lenta. Aquí cada bloque es su propio
 * Server Component asíncrono con su consulta: la página los envuelve en
 * `<Suspense>` y lo importante (la fila de KPIs) llega primero mientras el
 * resto sigue en vuelo. La lógica de las consultas no cambia — solo dónde se
 * esperan.
 */
import { cache } from "react";
import Link from "next/link";
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
  getPostalCodeStats,
  getAgeBrackets,
  getMembersByService,
  getAcquisitionChannels,
  getTopServices,
  getMemberRanking,
  getLeadCloseRate,
  getSexDistribution,
} from "@/lib/dashboard-queries";
import PostalMapPanel from "./postal-map-panel";
import { KpiCard, Card } from "@/components/kpi-card";
import { EUR_FORMAT } from "@/components/ui/count-up";
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

export const RANKING_DIMENSION_LABEL: Record<string, string> = {
  mixed: "Mixto",
  ltv: "LTV",
  adherence: "Adherencia",
  tenure: "Antigüedad",
};

export const eur = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * `getMemberDemographics` alimenta tres paneles distintos. Con `cache()` la
 * consulta sigue ejecutándose una sola vez por petición aunque cada panel la
 * pida por su cuenta.
 */
const demographicsFor = cache((orgId: string) => getMemberDemographics(orgId));

type PanelProps = { orgId: string };

/* ---------- Fila 1: KPIs de cabecera ---------- */

export async function KpiRow({ orgId }: PanelProps) {
  const kpis = await getKpis(orgId);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      <KpiCard label="Socios activos" value={String(kpis.activeMembers)} numericValue={kpis.activeMembers} delay={0.04} />
      <KpiCard
        label="Morosos"
        value={String(kpis.delinquent)}
        numericValue={kpis.delinquent}
        tone={kpis.delinquent > 0 ? "critical" : "default"}
        hint={kpis.delinquent > 0 ? "recibos fallidos" : ""}
        delay={0.1}
      />
      <KpiCard label="Congelados" value={String(kpis.frozen)} numericValue={kpis.frozen} tone="warning" delay={0.16} />
      <KpiCard
        label="Ingresos del mes"
        value={eur(kpis.monthRevenueCents)}
        numericValue={kpis.monthRevenueCents}
        format={EUR_FORMAT}
        tone="good"
        delay={0.22}
      />
      <KpiCard
        label="Sesiones este mes"
        value={String(kpis.sessionsThisMonth)}
        numericValue={kpis.sessionsThisMonth}
        delay={0.28}
      />
      <KpiCard
        label="Alertas de retención"
        value={String(kpis.openAlerts)}
        numericValue={kpis.openAlerts}
        tone={kpis.openAlerts > 0 ? "warning" : "default"}
        hint="ver módulo Retención"
        delay={0.34}
      />
    </div>
  );
}

/* ---------- Fila 2: ingresos y estado ---------- */

export async function RevenuePanel({ orgId }: PanelProps) {
  const revenueByMonth = await getRevenueByMonth(orgId);
  return (
    <Card title="Ingresos por mes" meta="Últimos 6 meses" delay={0.12}>
      <RevenueByMonthChart data={revenueByMonth} />
    </Card>
  );
}

export async function MemberStatePanel({ orgId }: PanelProps) {
  const stateBreakdown = await getMemberStateBreakdown(orgId);
  return (
    <Card title="Socios por estado" delay={0.18}>
      <MemberStateChart data={stateBreakdown} />
    </Card>
  );
}

/* ---------- Fila 3: ocupación ---------- */

export async function OccupancyByCenterPanel({ orgId }: PanelProps) {
  const occupancyByCenter = await getOccupancyByCenter(orgId);
  return (
    <Card title="Ocupación por centro" meta="30 días" delay={0.24}>
      <OccupancyByCenterChart data={occupancyByCenter} />
    </Card>
  );
}

export async function OccupancyByWeekdayPanel({ orgId }: PanelProps) {
  const occupancyByWeekday = await getOccupancyByWeekday(orgId);
  return (
    <Card title="Ocupación por día" meta="60 días" delay={0.3}>
      <OccupancyByWeekdayChart data={occupancyByWeekday} />
    </Card>
  );
}

export async function NoShowPanel({ orgId }: PanelProps) {
  const noShowRate = await getNoShowRate(orgId);
  return <NoShowRateCard rate={noShowRate} />;
}

/* ---------- Fila 4: retención y método de pago ---------- */

export async function RetentionPanel({ orgId }: PanelProps) {
  const cohorts = await getCohortRetention(orgId);
  return (
    <Card title="Retención por cohorte" meta="% aún activos por mes de alta" delay={0.42}>
      <RetentionCohortChart data={cohorts} />
    </Card>
  );
}

export async function RevenueByMethodPanel({ orgId }: PanelProps) {
  const revenueByMethod = await getRevenueByMethod(orgId);
  return (
    <Card title="Ingresos por método de pago" delay={0.48}>
      <RevenueByMethodChart data={revenueByMethod} />
    </Card>
  );
}

/* ---------- Fila 5: LTV y demografía ---------- */

export async function LtvRow({ orgId }: PanelProps) {
  const [ltvTicket, demographics] = await Promise.all([getLtvAndTicket(orgId), demographicsFor(orgId)]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
      <KpiCard
        label="LTV medio por cliente"
        value={eur(ltvTicket.ltvEuros * 100)}
        numericValue={Math.round(ltvTicket.ltvEuros * 100)}
        format={EUR_FORMAT}
        hint={`${ltvTicket.payingMembers} clientes con cobros`}
        tone="good"
        delay={0.5}
      />
      <KpiCard
        label="Ticket medio"
        value={eur(ltvTicket.avgTicketEuros * 100)}
        numericValue={Math.round(ltvTicket.avgTicketEuros * 100)}
        format={EUR_FORMAT}
        delay={0.54}
      />
      <KpiCard
        label="Edad media"
        value={demographics.avgAge ? `${demographics.avgAge} años` : "—"}
        numericValue={demographics.avgAge ?? undefined}
        format={{ suffix: " años" }}
        delay={0.58}
      />
      <KpiCard
        label="% con hijos / empresarios"
        value={`${demographics.pctWithChildren ?? "—"}% / ${demographics.pctBusinessOwners ?? "—"}%`}
        delay={0.62}
      />
    </div>
  );
}

/* ---------- Fila 6: sexo, ocupación, objetivos ---------- */

export async function SexPanel({ orgId }: PanelProps) {
  const sexDistribution = await getSexDistribution(orgId);
  return (
    <Card title="Sexo" meta={`RB-BI-005 · ${sexDistribution.unspecified} sin especificar`} delay={0.52}>
      {sexDistribution.answered.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin datos de sexo todavía.</p>
      ) : (
        <DonutChart data={sexDistribution.answered.map((s) => ({ label: s.label, value: s.count }))} metric="socios" />
      )}
    </Card>
  );
}

export async function OccupationPanel({ orgId }: PanelProps) {
  const demographics = await demographicsFor(orgId);
  return (
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
  );
}

export async function GoalsPanel({ orgId }: PanelProps) {
  const goalsAggregate = await getGoalsAggregate(orgId);
  return (
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
  );
}

/* ---------- Fila 7: edad y canal ---------- */

export async function AgeBracketsPanel({ orgId }: PanelProps) {
  const [ageBrackets, demographics] = await Promise.all([getAgeBrackets(orgId), demographicsFor(orgId)]);
  return (
    <Card title="Franjas de edad" meta={`muestra: ${demographics.sampleSize}`} delay={0.66}>
      <AgeBracketsChart data={ageBrackets} />
    </Card>
  );
}

export async function ChannelsPanel({ orgId }: PanelProps) {
  const acquisitionChannels = await getAcquisitionChannels(orgId);
  return (
    <Card title="Canal de origen" meta="RB-BI-008 — todos los leads" delay={0.7}>
      {acquisitionChannels.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin leads registrados todavía.</p>
      ) : (
        <DonutChart data={acquisitionChannels.map((c) => ({ label: c.channel, value: c.count }))} metric="leads" />
      )}
    </Card>
  );
}

/* ---------- Fila 8: embudo, servicios ---------- */

export async function FunnelPanel({ orgId }: PanelProps) {
  const leadCloseRate = await getLeadCloseRate(orgId);
  const maxFunnel = Math.max(1, ...Object.values(leadCloseRate.funnel));
  const rows = [
    ["Sin contactar", leadCloseRate.funnel.sinContactar],
    ["Seguimiento", leadCloseRate.funnel.seguimiento],
    ["Con fecha valoración", leadCloseRate.funnel.conFechaValoracion],
    ["Cerrado", leadCloseRate.funnel.cerrado],
    ["No cerrado", leadCloseRate.funnel.noCerrado],
  ] as const;

  return (
    <Card
      title="Embudo de leads"
      meta={leadCloseRate.closeRatePct != null ? `${leadCloseRate.closeRatePct}% de cierre` : "sin decisiones"}
      delay={0.74}
    >
      <div className="space-y-2">
        {rows.map(([label, count], i) => (
          <div key={label} className="flex items-center gap-2.5 text-sm">
            <span className="w-32 shrink-0 text-text-2">{label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-tz-sand overflow-hidden">
              {/*
                El ancho se deja fijo al porcentaje final y lo que se anima es
                `scaleX` (tzGrow): animar `width` está prohibido por el plan §0.6.
              */}
              <div
                className="h-full bg-tz-black rounded-full origin-left"
                style={{
                  width: `${(count / maxFunnel) * 100}%`,
                  animation: `tzGrow .8s var(--ease-out-soft) ${(0.26 + i * 0.06).toFixed(2)}s both`,
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-xs text-brand-muted text-right tz-nums">{count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export async function MembersByServicePanel({ orgId }: PanelProps) {
  const membersByService = await getMembersByService(orgId);
  return (
    <Card title="Socios por servicio" meta="RB-BI-007 — suscripciones activas" delay={0.78}>
      {membersByService.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin suscripciones activas todavía.</p>
      ) : (
        <DonutChart data={membersByService.map((s) => ({ label: s.name, value: s.count }))} metric="socios" />
      )}
    </Card>
  );
}

export async function TopServicesPanel({
  orgId,
  servicesOrderBy,
  rankingDimensionParam,
}: PanelProps & { servicesOrderBy: "count" | "revenue"; rankingDimensionParam?: string }) {
  const topServices = await getTopServices(orgId, { orderBy: servicesOrderBy });
  return (
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
              href={`/dashboard?servicesOrderBy=${value}${rankingDimensionParam ? `&rankingDimension=${rankingDimensionParam}` : ""}`}
              scroll={false}
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
  );
}

/* ---------- Ranking ---------- */

export async function RankingPanel({
  orgId,
  rankingDimension,
  rankingPage,
  buildRankingUrl,
  servicesOrderByParam,
}: PanelProps & {
  rankingDimension: "mixed" | "ltv" | "adherence" | "tenure";
  rankingPage: number;
  buildRankingUrl: (page: number) => string;
  servicesOrderByParam?: string;
}) {
  const memberRanking = await getMemberRanking(orgId, { dimension: rankingDimension, page: rankingPage });
  return (
    <Card
      title="Ranking de socios"
      meta="RB-BI-011 — LTV, adherencia y antigüedad"
      delay={0.86}
      action={
        <div className="flex gap-1 text-xs">
          {(Object.keys(RANKING_DIMENSION_LABEL) as (keyof typeof RANKING_DIMENSION_LABEL)[]).map((dim) => (
            <Link
              key={dim}
              href={`/dashboard?rankingDimension=${dim}${servicesOrderByParam ? `&servicesOrderBy=${servicesOrderByParam}` : ""}`}
              scroll={false}
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
      {memberRanking.items.length === 0 ? (
        <p className="text-sm text-brand-muted">Sin socios activos todavía.</p>
      ) : (
        <div className="space-y-5">
          <MemberRankingChart data={memberRanking.items} dimension={rankingDimension} />
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
                {memberRanking.items.map((m, i) => (
                  <tr
                    key={m.memberId}
                    className="border-t border-tz-sand"
                    style={{ animation: `tzRowIn .28s ${Math.min(i, 10) * 0.02}s both` }}
                  >
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
          {memberRanking.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-tz-sand">
              {memberRanking.page > 1 && (
                <Link href={buildRankingUrl(1)} scroll={false} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                  Primero
                </Link>
              )}
              {memberRanking.page > 1 && (
                <Link href={buildRankingUrl(memberRanking.page - 1)} scroll={false} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                  ← Anterior
                </Link>
              )}
              <span className="text-xs text-brand-muted mx-2">
                Página {memberRanking.page} de {memberRanking.totalPages}
              </span>
              {memberRanking.page < memberRanking.totalPages && (
                <Link href={buildRankingUrl(memberRanking.page + 1)} scroll={false} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                  Siguiente →
                </Link>
              )}
              {memberRanking.page < memberRanking.totalPages && (
                <Link href={buildRankingUrl(memberRanking.totalPages)} scroll={false} className="px-3 py-1 text-xs rounded-md bg-tz-sand text-tz-black hover:bg-opacity-80 transition-all">
                  Último
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- Mapa de calor por código postal ---------- */

export async function PostalPanel({ orgId }: PanelProps) {
  const postalCodeStats = await getPostalCodeStats(orgId);
  return <PostalMapPanel points={postalCodeStats} />;
}

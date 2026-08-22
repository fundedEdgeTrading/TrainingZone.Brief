import { Suspense } from "react";
import { requireRole } from "@/lib/guard";
import { Skeleton, SkeletonKpiRow, SkeletonChartCard } from "@/components/ui/skeleton";
import {
  KpiRow,
  RevenuePanel,
  MemberStatePanel,
  OccupancyByCenterPanel,
  OccupancyByWeekdayPanel,
  NoShowPanel,
  RetentionPanel,
  RevenueByMethodPanel,
  LtvRow,
  SexPanel,
  OccupationPanel,
  GoalsPanel,
  AgeBracketsPanel,
  ChannelsPanel,
  FunnelPanel,
  MembersByServicePanel,
  TopServicesPanel,
  RankingPanel,
  PostalPanel,
} from "./panels";

/**
 * El panel se compone de bloques independientes, cada uno con su propia
 * consulta detrás de un límite de Suspense. Lo que el usuario mira primero —la
 * fila de KPIs— se pinta en cuanto está lista, sin esperar a los paneles
 * pesados (cohortes, ranking, mapa).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    servicesOrderBy?: string;
    rankingDimension?: string;
    rankingPage?: string;
  }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const orgId = session.user.orgId;
  const params = await searchParams;
  const servicesOrderBy = params.servicesOrderBy === "revenue" ? "revenue" : "count";
  const rankingDimension = (["mixed", "ltv", "adherence", "tenure"].includes(params.rankingDimension ?? "")
    ? params.rankingDimension
    : "mixed") as "mixed" | "ltv" | "adherence" | "tenure";
  const rankingPage = Math.max(1, parseInt(params.rankingPage ?? "1", 10) || 1);

  const buildRankingUrl = (page: number) => {
    const url = new URLSearchParams();
    url.set("rankingPage", String(page));
    if (params.rankingDimension) url.set("rankingDimension", params.rankingDimension);
    if (params.servicesOrderBy) url.set("servicesOrderBy", params.servicesOrderBy);
    return `/dashboard?${url.toString()}`;
  };

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-5">
      <Suspense fallback={<SkeletonKpiRow count={6} />}>
        <KpiRow orgId={orgId} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Suspense fallback={<SkeletonChartCard />}>
          <RevenuePanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard />}>
          <MemberStatePanel orgId={orgId} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.85fr] gap-4">
        <Suspense fallback={<SkeletonChartCard height={240} />}>
          <OccupancyByCenterPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={240} />}>
          <OccupancyByWeekdayPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={240} />}>
          <NoShowPanel orgId={orgId} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Suspense fallback={<SkeletonChartCard />}>
          <RetentionPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard />}>
          <RevenueByMethodPanel orgId={orgId} />
        </Suspense>
      </div>

      <Suspense fallback={<SkeletonKpiRow count={4} />}>
        <LtvRow orgId={orgId} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Suspense fallback={<SkeletonChartCard height={240} />}>
          <SexPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={240} />}>
          <OccupationPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={240} />}>
          <GoalsPanel orgId={orgId} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Suspense fallback={<SkeletonChartCard />}>
          <AgeBracketsPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard />}>
          <ChannelsPanel orgId={orgId} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1fr_1fr] gap-4">
        <Suspense fallback={<SkeletonChartCard height={260} />}>
          <FunnelPanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={260} />}>
          <MembersByServicePanel orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={260} />}>
          <TopServicesPanel
            orgId={orgId}
            servicesOrderBy={servicesOrderBy}
            rankingDimensionParam={params.rankingDimension}
          />
        </Suspense>
      </div>

      <Suspense fallback={<SkeletonChartCard height={420} />}>
        <RankingPanel
          orgId={orgId}
          rankingDimension={rankingDimension}
          rankingPage={rankingPage}
          buildRankingUrl={buildRankingUrl}
          servicesOrderByParam={params.servicesOrderBy}
        />
      </Suspense>

      <Suspense
        fallback={
          <div className="bg-brand-card border border-brand-border rounded-card p-[22px] flex flex-col gap-4">
            <Skeleton className="h-3.5 w-52" />
            <Skeleton className="h-[360px]" />
          </div>
        }
      >
        <PostalPanel orgId={orgId} />
      </Suspense>
    </div>
  );
}

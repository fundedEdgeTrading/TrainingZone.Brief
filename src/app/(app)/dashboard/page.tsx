import { Suspense } from "react";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { centerScopeFor } from "@/lib/center-scope";
import { resolveTimezone } from "@/lib/timezone";
import { parseRange } from "@/lib/dashboard-queries";
import { Skeleton, SkeletonKpiRow, SkeletonChartCard } from "@/components/ui/skeleton";
import { ContextBar, type CenterOption } from "./context-bar";
import { ZoneDivider } from "./panel-card";
import type { DashboardParams } from "./params";
import {
  InsightPanel,
  KpiRow,
  RevenuePanel,
  MemberStatePanel,
  OccupancyByCenterPanel,
  OccupancyByWeekdayPanel,
  NoShowPanel,
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
  WeeklyChurnPanel,
  type RankSort,
} from "./panels";

const RANK_SORTS: RankSort[] = ["ltv", "adherence", "tenure", "mixed"];

/**
 * Panel de control de dirección.
 *
 * Rediseño 2026-08. El orden de arriba abajo ya no es el histórico de cuándo se
 * fue añadiendo cada panel, sino una jerarquía de lectura en cinco zonas: qué
 * ha pasado hoy (insight + KPIs), dónde está el negocio (el mapa de calor, que
 * antes cerraba la página siendo lo que más destaca), dinero, ocupación y
 * actividad, retención y valor, captación y, al final, quién es nuestro socio.
 *
 * Cada bloque conserva su propio límite de Suspense: lo primero que se pinta es
 * lo primero que se mira.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    centerId?: string;
    range?: string;
    rankSort?: string;
    rankDir?: string;
    servicesOrderBy?: string;
  }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN"]);
  const orgId = session.user.orgId;
  const query = await searchParams;

  const [org, centers, scope] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    prisma.center.findMany({ where: { orgId }, select: { id: true, name: true, timezone: true }, orderBy: { name: "asc" } }),
    centerScopeFor(session.user),
  ]);

  // El selector solo ofrece los centros en los que manda quien mira, y un
  // `?centerId=` a mano nunca amplía ese ámbito: si no está en la lista, se
  // ignora. `scope === null` es dirección de organización (manda en todos).
  const allowed = scope === null ? centers : centers.filter((c) => scope.includes(c.id));
  const requested = query.centerId && allowed.some((c) => c.id === query.centerId) ? query.centerId : null;
  // Una dirección de un solo centro no tiene "Todos" que elegir: su ámbito ya
  // es ese centro, y el panel debe enseñar sus cifras y no las de la org.
  const centerId = requested ?? (scope !== null && allowed.length === 1 ? allowed[0].id : null);

  const range = parseRange(query.range);
  const rankSort = (RANK_SORTS.includes(query.rankSort as RankSort) ? query.rankSort : "mixed") as RankSort;
  const rankDir = query.rankDir === "asc" ? "asc" : "desc";
  const servicesOrderBy = query.servicesOrderBy === "revenue" ? "revenue" : "count";

  const params: DashboardParams = {
    centerId: centerId ?? undefined,
    range: range === "mes" ? undefined : range,
    rankSort: rankSort === "mixed" ? undefined : rankSort,
    rankDir: rankDir === "desc" ? undefined : rankDir,
    servicesOrderBy: servicesOrderBy === "count" ? undefined : servicesOrderBy,
  };

  const shortName = (name: string) =>
    org?.name && name.toUpperCase().startsWith(org.name.toUpperCase())
      ? name.slice(org.name.length).trim() || name
      : name;
  const centerOptions: CenterOption[] = allowed.map((c) => ({ id: c.id, label: shortName(c.name) }));

  // El saludo se calcula con la hora del centro que se está mirando, que es la
  // que tiene delante quien abre el panel por la mañana.
  const activeCenter = allowed.find((c) => c.id === centerId) ?? allowed[0];
  const timezone = await resolveTimezone(activeCenter?.timezone);

  const panel = { orgId, centerId, range } as const;

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-3.5">
      <ContextBar
        userName={session.user.name ?? session.user.email ?? ""}
        timezone={timezone}
        centers={centerOptions}
        activeCenterId={centerId ?? "all"}
        range={range}
        params={params}
      />

      <Suspense fallback={<Skeleton className="h-[92px] rounded-[18px]" />}>
        <InsightPanel {...panel} />
      </Suspense>

      <Suspense fallback={<SkeletonKpiRow count={8} cols={4} />}>
        <KpiRow {...panel} />
      </Suspense>

      <ZoneDivider label="Dónde está el negocio" />

      <Suspense
        fallback={
          <div className="bg-brand-card border border-brand-border rounded-[18px] p-[22px] flex flex-col gap-4">
            <Skeleton className="h-3.5 w-52" />
            <Skeleton className="h-[440px]" />
          </div>
        }
      >
        <PostalPanel {...panel} />
      </Suspense>

      <ZoneDivider label="Dinero" />

      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-3.5">
        <Suspense fallback={<SkeletonChartCard height={330} />}>
          <RevenuePanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={330} />}>
          <RevenueByMethodPanel {...panel} />
        </Suspense>
      </div>

      <Suspense fallback={<SkeletonKpiRow count={4} cols={4} />}>
        <LtvRow {...panel} />
      </Suspense>

      <ZoneDivider label="Ocupación y actividad" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.85fr] gap-3.5">
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <OccupancyByCenterPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <OccupancyByWeekdayPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <NoShowPanel {...panel} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-3.5">
        <Suspense fallback={<SkeletonChartCard height={330} />}>
          <WeeklyChurnPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={330} />}>
          <MemberStatePanel {...panel} />
        </Suspense>
      </div>

      <ZoneDivider label="Retención y valor" />

      <Suspense fallback={<SkeletonChartCard height={420} />}>
        <RankingPanel {...panel} sort={rankSort} dir={rankDir} params={params} />
      </Suspense>

      <ZoneDivider label="Captación" />

      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr_1fr] gap-3.5">
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <FunnelPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <ChannelsPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <TopServicesPanel {...panel} servicesOrderBy={servicesOrderBy} params={params} />
        </Suspense>
      </div>

      <ZoneDivider label="Quién es nuestro socio" plain />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        <Suspense fallback={<SkeletonChartCard height={260} />}>
          <MembersByServicePanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={260} />}>
          <SexPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={260} />}>
          <OccupationPanel {...panel} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-3.5">
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <AgeBracketsPanel {...panel} />
        </Suspense>
        <Suspense fallback={<SkeletonChartCard height={280} />}>
          <GoalsPanel {...panel} />
        </Suspense>
      </div>
    </div>
  );
}

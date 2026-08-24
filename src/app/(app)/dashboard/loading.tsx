import { SkeletonCard, Skeleton, SkeletonChartCard } from "@/components/ui/skeleton";

/** Mismo esqueleto que la primera pantalla del panel: barra de contexto, insight y los ocho KPIs. */
export default function Loading() {
  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <div className="flex gap-3.5">
          <Skeleton className="h-10 w-64 rounded-pill" />
          <Skeleton className="h-10 w-48 rounded-pill" />
        </div>
      </div>
      <Skeleton className="h-[92px] rounded-[18px]" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <SkeletonChartCard height={520} />
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-3.5">
        <SkeletonChartCard height={330} />
        <SkeletonChartCard height={330} />
      </div>
    </div>
  );
}

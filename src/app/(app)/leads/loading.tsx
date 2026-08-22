import { Skeleton, SkeletonKpiRow } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-56" />
      <SkeletonKpiRow count={5} />
      {/* Tablero kanban: 5 columnas con tarjetas. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="bg-brand-card border border-brand-border rounded-card p-3 space-y-2.5">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-control" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

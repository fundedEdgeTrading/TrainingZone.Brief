import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("tz-skeleton", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-brand-card border border-brand-border rounded-card p-[18px] flex flex-col gap-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-brand-card border border-brand-border rounded-card overflow-hidden">
      <div className="px-5 py-3 bg-tz-bone/60 flex gap-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 border-t border-tz-sand flex gap-6 items-center">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Fila de KPIs del panel de control: misma rejilla que la página real. */
export function SkeletonKpiRow({ count = 6, cols = 6 }: { count?: number; cols?: 4 | 5 | 6 }) {
  const lg = { 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols];
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${lg}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Card con título y lienzo de gráfico. `height` iguala la altura de la card real. */
export function SkeletonChartCard({ height = 288 }: { height?: number }) {
  return (
    <div
      className="bg-brand-card border border-brand-border rounded-card p-[22px] flex flex-col gap-4"
      style={{ height }}
    >
      <Skeleton className="h-3.5 w-44" />
      <Skeleton className="flex-1" />
    </div>
  );
}

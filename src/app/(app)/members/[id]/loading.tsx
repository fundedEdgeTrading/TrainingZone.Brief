import { Skeleton, SkeletonKpiRow } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      {/* Hero del socio: avatar + nombre + acciones. */}
      <div className="bg-brand-card border border-brand-border rounded-card shadow-card p-[22px] flex items-center gap-5">
        <Skeleton className="w-[72px] h-[72px] rounded-full shrink-0" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-control hidden sm:block" />
      </div>
      <SkeletonKpiRow count={4} />
      {/* Pestañas + panel activo. */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[38px] w-28 rounded-pill" />
        ))}
      </div>
      <div className="bg-brand-card border border-brand-border rounded-card p-[22px] space-y-4">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    </div>
  );
}

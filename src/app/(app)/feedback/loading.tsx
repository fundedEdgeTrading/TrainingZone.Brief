import { Skeleton, SkeletonKpiRow } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-64" />
      <SkeletonKpiRow count={4} />
      <div className="bg-brand-card border border-brand-border rounded-card overflow-hidden shadow-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 sm:px-[22px] py-4 border-b border-brand-border last:border-0 flex items-center gap-4">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

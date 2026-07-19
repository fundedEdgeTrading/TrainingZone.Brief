import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
          <Skeleton className="h-4 w-40 mb-5" />
          <Skeleton className="h-[230px] w-full" />
        </div>
        <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
          <Skeleton className="h-4 w-32 mb-5" />
          <Skeleton className="h-[230px] w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.85fr] gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-brand-card border border-brand-border rounded-card p-[22px]">
            <Skeleton className="h-4 w-28 mb-5" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

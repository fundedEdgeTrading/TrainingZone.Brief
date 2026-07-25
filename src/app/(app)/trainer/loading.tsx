import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-2">
        <div>
          <Skeleton className="h-3 w-56 mb-3" />
          <Skeleton className="h-9 w-72 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-control" />
          <Skeleton className="h-10 w-40 rounded-control" />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[1_1_600px] min-w-0 flex flex-col gap-5">
          <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
            <Skeleton className="h-4 w-40 mb-5" />
            <Skeleton className="h-[120px] w-full mb-5 rounded-[14px]" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
          <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
            <Skeleton className="h-4 w-48 mb-5" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        </div>
        <div className="flex-[1_1_300px] min-w-0 max-w-[420px] flex flex-col gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-brand-card border border-brand-border rounded-card p-[22px]">
              <Skeleton className="h-4 w-32 mb-5" />
              <Skeleton className="h-[140px] w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-5">
      <Skeleton className="h-[140px] w-full rounded-[18px]" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
          <Skeleton className="h-[210px] w-full" />
        </div>
        <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
          <Skeleton className="h-[210px] w-full" />
        </div>
      </div>
    </div>
  );
}

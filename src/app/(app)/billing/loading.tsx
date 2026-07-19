import { SkeletonCard, SkeletonTable, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="bg-brand-card border border-brand-border rounded-card p-[22px]">
        <Skeleton className="h-4 w-56 mb-4" />
        <Skeleton className="h-10 w-full" />
      </div>
      <SkeletonTable rows={6} />
    </div>
  );
}

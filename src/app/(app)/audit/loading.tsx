import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-72" />
      <div className="bg-brand-card border border-brand-border rounded-card p-3 shadow-card flex gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[34px] w-32 rounded-control" />
        ))}
      </div>
      <SkeletonTable rows={10} />
    </div>
  );
}

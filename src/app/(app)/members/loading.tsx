import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-40" />
      <div className="bg-brand-card border border-brand-border rounded-card p-3 shadow-card">
        <Skeleton className="h-10 w-full" />
      </div>
      <SkeletonTable rows={8} />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3.5 w-full max-w-[540px]" />
      </div>
      <Skeleton className="h-2 w-full rounded-pill" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}

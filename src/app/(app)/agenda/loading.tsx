import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="bg-brand-card border border-brand-border rounded-card p-4" style={{ height: 700 }}>
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1120px] mx-auto flex flex-col gap-[18px]">
      <Skeleton className="h-[150px] w-full rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-brand-card border border-brand-border rounded-card p-[22px] space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      <div className="bg-tz-sand rounded-2xl px-[26px] py-[22px] space-y-3">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[52px] w-[68px] rounded-control" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}

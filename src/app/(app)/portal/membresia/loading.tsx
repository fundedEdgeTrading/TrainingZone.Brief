import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-[1120px] mx-auto flex flex-col gap-[18px]">
      <Skeleton className="h-[150px] w-full rounded-2xl" />
      <div className="bg-brand-card border border-brand-border rounded-card p-[22px] space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-[180px] w-full" />
      </div>
    </div>
  );
}

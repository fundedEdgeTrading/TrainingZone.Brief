import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-80 max-w-full" />
      {Array.from({ length: 3 }).map((_, s) => (
        <section key={s} className="space-y-3">
          <Skeleton className="h-3.5 w-36" />
          <div className="bg-brand-card border border-brand-border rounded-card p-[22px] space-y-4">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-[150px] w-full" />
          </div>
        </section>
      ))}
    </div>
  );
}

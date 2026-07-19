import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("tz-skeleton", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-brand-card border border-brand-border rounded-card p-[18px] flex flex-col gap-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-brand-card border border-brand-border rounded-card overflow-hidden">
      <div className="px-5 py-3 bg-tz-bone/60 flex gap-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 border-t border-tz-sand flex gap-6 items-center">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

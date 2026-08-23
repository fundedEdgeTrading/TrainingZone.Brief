import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera del socio: avatar + nombre + acciones, y franja de 4 métricas. */}
      <div className="bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden">
        <div className="flex items-start justify-between gap-5 flex-wrap p-6 pl-[26px]">
          <div className="flex items-center gap-[18px]">
            <Skeleton className="w-[76px] h-[76px] rounded-full shrink-0" />
            <div className="space-y-2.5">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-3.5 w-64" />
              <Skeleton className="h-5 w-32 rounded-pill" />
            </div>
          </div>
          <div className="hidden sm:flex gap-2">
            <Skeleton className="h-9 w-28 rounded-control" />
            <Skeleton className="h-9 w-28 rounded-control" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-brand-subtle-2 bg-brand-bg">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 px-[26px] space-y-2">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Rail de secciones + panel activo. */}
      <div className="grid grid-cols-1 lg:grid-cols-[252px_minmax(0,1fr)] gap-4 items-start">
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card p-2.5 flex flex-row lg:flex-col gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[42px] w-28 lg:w-full rounded-xl shrink-0" />
          ))}
        </div>
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card p-[18px] lg:p-7 space-y-5">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-[280px] w-full" />
        </div>
      </div>
    </div>
  );
}

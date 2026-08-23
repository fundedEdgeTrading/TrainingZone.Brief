import { Skeleton } from "@/components/ui/skeleton";

/** El mapa va a sangre: el esqueleto ocupa el mismo hueco, no una tarjeta. */
export default function Loading() {
  return (
    <div data-full-bleed className="absolute inset-0 bg-tz-sand">
      <div className="absolute top-5 left-5 flex flex-col gap-2.5">
        <Skeleton className="h-[46px] w-[520px] max-w-[70vw] rounded-[14px]" />
        <Skeleton className="h-[38px] w-64 rounded-xl" />
      </div>
      <div className="hidden lg:flex absolute top-5 right-5 bottom-5 w-[344px] flex-col gap-3">
        <Skeleton className="h-[196px] rounded-card" />
        <Skeleton className="flex-1 rounded-card" />
      </div>
    </div>
  );
}

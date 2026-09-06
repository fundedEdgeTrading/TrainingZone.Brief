"use client";

import { CriticalError } from "@/components/ui/critical-error";
import { useHomeRoute } from "@/app/(app)/home-route";

/** E8-01 · La ficha del socio es la ruta con más consultas (plan, bonos, reservas, valoraciones, salud) y la que se abre con alguien delante del mostrador. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const homeHref = useHomeRoute();
  return <CriticalError title="No hemos podido cargar la ficha del socio" error={error} reset={reset} homeHref={homeHref} />;
}

"use client";

import { CriticalError } from "@/components/ui/critical-error";
import { useHomeRoute } from "@/app/(app)/home-route";

/** E8-01 · El panel cruza reservas, cobros y altas en la misma carga: con límite propio, un solo agregado en fallo no se lleva por delante la pantalla que se abre cada mañana. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const homeHref = useHomeRoute();
  return <CriticalError title="No hemos podido cargar el panel" error={error} reset={reset} homeHref={homeHref} />;
}

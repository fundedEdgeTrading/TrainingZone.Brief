"use client";

import { CriticalError } from "@/components/ui/critical-error";
import { useHomeRoute } from "@/app/(app)/home-route";

/** E8-01 · La agenda resuelve sesiones, reservas y lista de espera en cada carga. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const homeHref = useHomeRoute();
  return <CriticalError title="No hemos podido cargar la agenda" error={error} reset={reset} homeHref={homeHref} />;
}

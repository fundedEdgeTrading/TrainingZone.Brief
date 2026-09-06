"use client";

import { CriticalError } from "@/components/ui/critical-error";
import { useHomeRoute } from "@/app/(app)/home-route";

/** E8-01 · Facturación depende de Stripe además de la base de datos, así que tiene una superficie de fallo propia. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const homeHref = useHomeRoute();
  return <CriticalError title="No hemos podido cargar la facturación" error={error} reset={reset} homeHref={homeHref} />;
}

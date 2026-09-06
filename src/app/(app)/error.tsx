"use client";

import { CriticalError } from "@/components/ui/critical-error";
import { useHomeRoute } from "@/app/(app)/home-route";

/** E8-01 · Red de seguridad de toda la aplicación. A diferencia de la pantalla genérica de Next, este límite se pinta DENTRO del layout de `(app)`, así que el sidebar y la cabecera siguen ahí y siempre queda una salida. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const homeHref = useHomeRoute();
  return <CriticalError title="No hemos podido cargar esta pantalla" error={error} reset={reset} homeHref={homeHref} />;
}

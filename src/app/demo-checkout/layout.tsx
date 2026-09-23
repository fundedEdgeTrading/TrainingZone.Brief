import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isDemoModeActive } from "@/lib/platform-plans";

/**
 * PROD-01 · Todo lo que cuelga de `/demo-checkout` existe solo en modo demo
 * explícito (`DEMO_MODE`, ver `lib/demo-mode.ts`). El corte vive también aquí
 * para que una pantalla nueva bajo esta carpeta no nazca abierta por olvido.
 *
 * No sustituye a las comprobaciones de cada página ni de cada server action:
 * layout y página se renderizan a la vez, y una action es un endpoint propio
 * que no pasa por ningún layout.
 */
export const dynamic = "force-dynamic";

export default function DemoCheckoutLayout({ children }: { children: ReactNode }) {
  if (!isDemoModeActive()) notFound();
  return children;
}

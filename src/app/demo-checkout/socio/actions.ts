"use server";

import { confirmDemoMemberCheckout, type ConfirmDemoResult } from "@/lib/demo-member-checkout";
import { isDemoModeActive } from "@/lib/platform-plans";

/**
 * HU-ST-11 · Confirmación del pago de DEMOSTRACIÓN de un socio.
 *
 * Toda la protección vive en `confirmDemoMemberCheckout`: comprueba
 * `isDemoModeActive()` (igual que la action del plano 1, E1-11) y verifica la
 * firma del intent. La action es invocable directamente, así que no puede
 * aportar nada que la pantalla ya haya comprobado.
 */
export async function confirmDemoMemberCheckoutAction(token: string): Promise<ConfirmDemoResult> {
  // PROD-01: defensa en profundidad. `confirmDemoMemberCheckout` ya lo
  // comprueba, pero esta action es un endpoint público: el corte se ve aquí,
  // en la puerta, y no depende de que nadie retoque la librería.
  if (!isDemoModeActive()) return { ok: false, error: "El pago de demostración no está disponible en este entorno." };
  return confirmDemoMemberCheckout(token);
}

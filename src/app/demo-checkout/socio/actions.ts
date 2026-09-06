"use server";

import { confirmDemoMemberCheckout, type ConfirmDemoResult } from "@/lib/demo-member-checkout";

/**
 * HU-ST-11 · Confirmación del pago de DEMOSTRACIÓN de un socio.
 *
 * Toda la protección vive en `confirmDemoMemberCheckout`: comprueba
 * `isDemoModeActive()` (igual que la action del plano 1, E1-11) y verifica la
 * firma del intent. La action es invocable directamente, así que no puede
 * aportar nada que la pantalla ya haya comprobado.
 */
export async function confirmDemoMemberCheckoutAction(token: string): Promise<ConfirmDemoResult> {
  return confirmDemoMemberCheckout(token);
}

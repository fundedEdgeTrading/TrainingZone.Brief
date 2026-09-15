"use server";

import { prisma } from "@/lib/prisma";
import { verifyMemberBillingOrDunningToken } from "@/lib/email-verification";
import { createMemberBillingPortalSession } from "@/lib/member-billing";
import { retryOpenInvoice } from "@/lib/stripe-dunning";

/**
 * HU-ST-19 · Acciones de la pantalla de recuperación.
 *
 * El token es la única credencial: esta pantalla se abre desde el email de
 * impago, sin sesión. Por eso cada acción lo vuelve a verificar por su cuenta
 * —no basta con que la página lo hiciera al pintarse— y resuelve el socio a
 * partir de él. Nada del formulario identifica a nadie: un `memberId` que
 * viniera en el `FormData` sería un cambio de método de pago ajeno a un clic de
 * distancia.
 */

export type RecoveryResult =
  | { ok: true; message: string; url?: string }
  | { ok: false; error: string; needsPaymentMethod?: boolean };

const INVALID = "Este enlace ya no es válido. Pide uno nuevo desde tu portal o contacta con tu centro.";

async function memberFromToken(token: string) {
  const result = verifyMemberBillingOrDunningToken(token);
  if (!result.ok) return null;
  return prisma.member.findUnique({ where: { id: result.memberId }, select: { id: true, orgId: true } });
}

/** "Pagar ahora": reintenta la factura pendiente en el momento. */
export async function retryPendingInvoice(formData: FormData): Promise<RecoveryResult> {
  const token = String(formData.get("token") ?? "");
  const member = await memberFromToken(token);
  if (!member) return { ok: false, error: INVALID };

  const result = await retryOpenInvoice(member.orgId, member.id);
  if (!result.ok) return { ok: false, error: result.error, needsPaymentMethod: result.needsPaymentMethod };

  return {
    ok: true,
    message: result.paid
      ? "Cobro completado. Tu acceso ya está restablecido."
      : "Hemos enviado el cobro a tu banco. Los adeudos domiciliados tardan unos días en confirmarse.",
  };
}

/** "Actualizar mi método de pago": Billing Portal de la cuenta conectada. */
export async function openBillingPortal(formData: FormData): Promise<RecoveryResult> {
  const token = String(formData.get("token") ?? "");
  const member = await memberFromToken(token);
  if (!member) return { ok: false, error: INVALID };

  const portal = await createMemberBillingPortalSession(member.orgId, member.id);
  if (!portal.ok) {
    // Sin tecnicismos: da igual si Stripe no está configurado para el gimnasio
    // o si el socio nunca ha pagado nada online — al socio le vale el mismo
    // mensaje y el mismo siguiente paso.
    return {
      ok: false,
      error: "Todavía no tienes un método de pago registrado con nosotros. Contacta con tu centro.",
    };
  }
  return { ok: true, message: "Abriendo tu método de pago…", url: portal.url };
}

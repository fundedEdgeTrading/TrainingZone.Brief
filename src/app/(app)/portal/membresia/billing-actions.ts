"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { stripeForOrg } from "@/lib/stripe";

export type ReceiptUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * E5-02: comprobante descargable de un recibo. No guardamos ninguna URL de
 * Stripe en `Payment` (cambia de sesión a sesión), así que se resuelve en
 * vivo contra la factura (cuota recurrente) o el cargo del PaymentIntent
 * (bono puntual) en el momento en que el socio pulsa "Descargar".
 */
export async function getMemberReceiptUrl(paymentId: string): Promise<ReceiptUrlResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, memberId: member.id, orgId: session.user.orgId },
    select: { stripeInvoiceId: true, stripeCheckoutSessionId: true },
  });
  if (!payment) return { ok: false, error: "Recibo no encontrado." };

  const resolved = await stripeForOrg(session.user.orgId);
  if (!resolved.ok) return { ok: false, error: "No se puede acceder al recibo ahora mismo." };
  const { stripe, accountId } = resolved;

  try {
    if (payment.stripeInvoiceId) {
      const invoice = await stripe.invoices.retrieve(payment.stripeInvoiceId, {}, { stripeAccount: accountId });
      const url = invoice.hosted_invoice_url ?? invoice.invoice_pdf;
      if (url) return { ok: true, url };
    }

    if (payment.stripeCheckoutSessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(
        payment.stripeCheckoutSessionId,
        { expand: ["payment_intent.latest_charge"] },
        { stripeAccount: accountId }
      );
      const paymentIntent = checkoutSession.payment_intent;
      if (paymentIntent && typeof paymentIntent === "object") {
        const charge = paymentIntent.latest_charge;
        if (charge && typeof charge === "object" && charge.receipt_url) {
          return { ok: true, url: charge.receipt_url };
        }
      }
    }
  } catch {
    return { ok: false, error: "No se ha podido recuperar el recibo." };
  }

  return { ok: false, error: "Este recibo no tiene comprobante descargable." };
}

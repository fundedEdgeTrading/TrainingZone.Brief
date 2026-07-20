import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { reconcileStripeCheckoutCompleted, reconcileStripePaymentFailed } from "@/lib/stripe-checkout";

/** F12/RB-PAGO-002: el cierre de un lead depende de la confirmación de Stripe, nunca de una acción manual. */
export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ ok: false, error: "Stripe no está configurado en este entorno." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ ok: false, error: "Falta la firma de Stripe." }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, error: "Firma inválida." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      await reconcileStripeCheckoutCompleted(session.id, paymentIntentId);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      await reconcileStripePaymentFailed(session.id);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

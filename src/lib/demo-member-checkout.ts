import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isDemoModeActive } from "@/lib/platform-plans";
import { createPaymentWithReceipt } from "@/lib/payments";
import { createSubscriptionFromPlan } from "@/lib/subscriptions";
import { isRecurring } from "@/lib/plan-recurrence";
import { publicOrigin } from "@/lib/site";

/**
 * HU-ST-11 / RB-PAGO-024 · Modo demo también en el plano 2.
 *
 * `/demo-checkout` sustituía el checkout de **licencia** cuando no hay
 * `STRIPE_SECRET_KEY`, pero no había equivalente para el cobro a socios: sin
 * Stripe, el socio simplemente no podía comprar y toda la mitad del producto que
 * de verdad se enseña en una demo —bono, saldo, reserva— quedaba inalcanzable.
 *
 * ## Esto es TEMPORAL
 *
 * Esta ruta existe solo mientras Stripe no está vivo en producción. **Se retira
 * el día que se configure `STRIPE_SECRET_KEY` en el entorno de producción**, y
 * `isDemoModeActive()` la apaga sola en cuanto eso ocurra: sin la clave no hay
 * cobro real posible, con la clave esta vía deja de existir. No añadir aquí
 * ninguna funcionalidad que no sea reproducir lo que hace el webhook.
 *
 * ## Por qué va firmado
 *
 * El checkout de licencia es anónimo por naturaleza (nadie ha comprado aún). El
 * de socio no: identifica a un socio, un plan y un centro concretos. Pasarlos en
 * la URL en claro convertiría la pantalla en "regálame el bono que quiera al
 * socio que quiera". El intent va firmado con `AUTH_SECRET`, con el mismo patrón
 * que los enlaces de `email-verification.ts` pero con carga compuesta.
 */

const PURPOSE = "demo-member-checkout";
/** Lo que dura un checkout en la mano: el mismo orden de magnitud que una sesión de Stripe. */
const TTL_MS = 30 * 60 * 1000;

export type DemoMemberCheckoutIntent = {
  orgId: string;
  memberId: string;
  planId: string;
  centerId: string;
  soldByUserId?: string | null;
  /** A dónde vuelve el socio al confirmar, igual que el `success_url` real. */
  returnPath: string;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET no configurado — necesario para firmar el checkout de demostración.");
  return value;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function generateDemoMemberCheckoutToken(intent: DemoMemberCheckoutIntent): string {
  const payload = JSON.stringify({ p: PURPOSE, ...intent, exp: Date.now() + TTL_MS });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(payload)}`;
}

export type DemoTokenResult =
  | { ok: true; intent: DemoMemberCheckoutIntent }
  | { ok: false; error: "invalid" | "expired" };

export function verifyDemoMemberCheckoutToken(token: string): DemoTokenResult {
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return { ok: false, error: "invalid" };

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return { ok: false, error: "invalid" };
  }

  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(sign(payload));
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return { ok: false, error: "invalid" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "invalid" };
  }

  if (parsed.p !== PURPOSE) return { ok: false, error: "invalid" };
  const exp = Number(parsed.exp);
  if (!Number.isFinite(exp)) return { ok: false, error: "invalid" };
  if (Date.now() > exp) return { ok: false, error: "expired" };

  const { orgId, memberId, planId, centerId, soldByUserId, returnPath } = parsed as Record<string, string | null>;
  if (!orgId || !memberId || !planId || !centerId || !returnPath) return { ok: false, error: "invalid" };

  return { ok: true, intent: { orgId, memberId, planId, centerId, soldByUserId: soldByUserId ?? null, returnPath } };
}

export function demoMemberCheckoutUrl(intent: DemoMemberCheckoutIntent): string {
  const token = generateDemoMemberCheckoutToken(intent);
  return `${publicOrigin()}/demo-checkout/socio?t=${encodeURIComponent(token)}`;
}

export type DemoCheckoutSummary = {
  memberName: string;
  planName: string;
  priceCents: number;
  recurring: boolean;
  returnPath: string;
};

/** Lo que se enseña en la pantalla antes de confirmar. `null` si el intent ya no cuadra. */
export async function loadDemoMemberCheckout(intent: DemoMemberCheckoutIntent): Promise<DemoCheckoutSummary | null> {
  const [member, plan] = await Promise.all([
    prisma.member.findFirst({
      where: { id: intent.memberId, orgId: intent.orgId },
      select: { firstName: true, lastName: true },
    }),
    prisma.membershipPlan.findFirst({
      where: { id: intent.planId, orgId: intent.orgId, active: true },
      select: { name: true, priceCents: true, type: true },
    }),
  ]);
  if (!member || !plan) return null;

  return {
    memberName: `${member.firstName} ${member.lastName}`,
    planName: plan.name,
    priceCents: plan.priceCents,
    recurring: isRecurring(plan.type),
    returnPath: intent.returnPath,
  };
}

export type ConfirmDemoResult = { ok: true; returnPath: string } | { ok: false; error: string };

/**
 * Confirma la compra de demostración: deja exactamente lo que dejaría el
 * webhook tras un cobro real —`Subscription` con su saldo resuelto por
 * `createSubscriptionFromPlan` y `Payment` PAID— y nada más.
 *
 * Idempotente por el id sintético de sesión: `Payment.stripeCheckoutSessionId`
 * es único, así que recargar la pantalla de confirmación no regala un segundo
 * bono.
 */
export async function confirmDemoMemberCheckout(token: string): Promise<ConfirmDemoResult> {
  // Protección, igual que la server action del plano 1 (E1-11): con Stripe
  // configurado esta vía no existe, aunque alguien conserve un token firmado.
  if (!isDemoModeActive()) return { ok: false, error: "El pago de demostración no está disponible en este entorno." };

  const verified = verifyDemoMemberCheckoutToken(token);
  if (!verified.ok) {
    return {
      ok: false,
      error: verified.error === "expired" ? "Este pago de demostración ha caducado." : "Enlace no válido.",
    };
  }
  const intent = verified.intent;

  const [member, plan, center] = await Promise.all([
    prisma.member.findFirst({ where: { id: intent.memberId, orgId: intent.orgId }, select: { id: true } }),
    prisma.membershipPlan.findFirst({
      where: { id: intent.planId, orgId: intent.orgId, active: true },
      select: { id: true, name: true, priceCents: true, sessionsIncluded: true, type: true },
    }),
    prisma.center.findFirst({ where: { id: intent.centerId, orgId: intent.orgId }, select: { id: true } }),
  ]);
  if (!member || !plan || !center) return { ok: false, error: "Ese producto ya no está disponible." };

  const sessionId = `demo_cs_${crypto.createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
  const already = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: { id: true },
  });
  if (already) return { ok: true, returnPath: intent.returnPath };

  const subscription = await createSubscriptionFromPlan(prisma, {
    memberId: member.id,
    centerId: center.id,
    plan,
    // E2-15: quien vendió firma el asiento de apertura del libro mayor. En una
    // compra desde el portal no hay nadie del centro detrás y queda sin firma,
    // igual que en el cobro real por webhook.
    actorUserId: intent.soldByUserId ?? null,
  });

  await createPaymentWithReceipt({
    orgId: intent.orgId,
    memberId: member.id,
    subscriptionId: subscription.id,
    amountCents: plan.priceCents,
    method: "STRIPE",
    status: "PAID",
    date: new Date(),
    stripeCheckoutSessionId: sessionId,
    soldByUserId: intent.soldByUserId ?? null,
    notes: `Pago de DEMOSTRACIÓN (sin cobro real) — ${plan.name}`,
  });

  return { ok: true, returnPath: intent.returnPath };
}

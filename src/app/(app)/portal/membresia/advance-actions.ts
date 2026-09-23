"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import {
  AdvanceRenewalError,
  advanceRenewal,
  previewAdvanceRenewal,
  type AdvanceRenewalErrorCode,
} from "@/lib/stripe-advance-renewal";

/**
 * ADV-02 · Adelantar la renovación desde "Mi membresía".
 *
 * El `subscriptionId` llega del cliente, pero no se confía en él: el socio y
 * la organización salen de la sesión, y `advanceRenewal` comprueba que la
 * suscripción es de los dos antes de hablar con Stripe.
 *
 * Paridad móvil (`POST /api/mobile/v1/portal/billing/advance`): fuera de
 * alcance de esta pista; debe llamar a la misma `advanceRenewal`.
 */

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

type Failure = { ok: false; code: AdvanceRenewalErrorCode | "NO_MEMBER"; error: string; hostedInvoiceUrl?: string | null };

function failure(err: unknown): Failure {
  if (err instanceof AdvanceRenewalError) {
    return { ok: false, code: err.code, error: err.message, hostedInvoiceUrl: err.hostedInvoiceUrl };
  }
  console.error("[advance-renewal]", err);
  return { ok: false, code: "STRIPE_ERROR", error: "No se ha podido adelantar la renovación. Inténtalo de nuevo en un momento." };
}

export type AdvancePreviewResult =
  | {
      ok: true;
      amountCents: number;
      currency: string;
      /** ISO: las fechas cruzan la frontera servidor → cliente como texto. */
      nextChargeAt: string | null;
      currentPeriodEnd: string | null;
    }
  | Failure;

export async function getAdvanceRenewalPreview(subscriptionId: string): Promise<AdvancePreviewResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, code: "NO_MEMBER", error: "No se ha encontrado tu ficha de socio." };
  try {
    const preview = await previewAdvanceRenewal({
      orgId: ctx.session.user.orgId,
      memberId: ctx.member.id,
      subscriptionId,
    });
    return {
      ok: true,
      amountCents: preview.amountCents,
      currency: preview.currency,
      nextChargeAt: preview.nextChargeAt?.toISOString() ?? null,
      currentPeriodEnd: preview.currentPeriodEnd?.toISOString() ?? null,
    };
  } catch (err) {
    return failure(err);
  }
}

export type AdvanceRenewalActionResult =
  | { ok: true; status: "paid"; nextChargeAt: string | null }
  | { ok: true; status: "requires_action"; hostedInvoiceUrl: string }
  | Failure;

export async function advanceRenewalAction(subscriptionId: string): Promise<AdvanceRenewalActionResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, code: "NO_MEMBER", error: "No se ha encontrado tu ficha de socio." };
  try {
    const result = await advanceRenewal({
      orgId: ctx.session.user.orgId,
      memberId: ctx.member.id,
      subscriptionId,
      actorUserId: ctx.session.user.id,
    });
    revalidatePath("/portal/membresia");
    if (result.status === "requires_action") return { ok: true, status: "requires_action", hostedInvoiceUrl: result.hostedInvoiceUrl };
    return { ok: true, status: "paid", nextChargeAt: result.nextChargeAt?.toISOString() ?? null };
  } catch (err) {
    return failure(err);
  }
}

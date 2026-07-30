"use server";

import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { createMemberCheckout, createMemberBillingPortalSession } from "@/lib/member-billing";

export type PortalBillingResult = { ok: true; url: string } | { ok: false; error: string };

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

/** F6: compra/recarga de bono desde el propio portal — mismo motor de checkout que recepción y la landing pública. */
export async function purchasePlan(planId: string): Promise<PortalBillingResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  return createMemberCheckout({
    orgId: ctx.session.user.orgId,
    memberId: ctx.member.id,
    planId,
    centerId: ctx.member.primaryCenterId,
    origin: "portal",
  });
}

/** F6: mismo Billing Portal de Stripe que usa el enlace mágico sin login (A.1), aquí ya autenticado. */
export async function manageMyBilling(): Promise<PortalBillingResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  return createMemberBillingPortalSession(ctx.session.user.orgId, ctx.member.id);
}

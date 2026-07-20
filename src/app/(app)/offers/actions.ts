"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { canApproveOffers, canProposeOffers } from "@/lib/rbac";
import { createManualOffer, elevateOffer, decideOffer, markOfferCommunicated } from "@/lib/offers-queries";

export type OfferActionResult = { ok: true } | { ok: false; error: string };

export async function createManualOfferAction(formData: FormData): Promise<OfferActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  if (!canProposeOffers(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const memberId = String(formData.get("memberId") ?? "");
  const description = String(formData.get("description") ?? "");
  const result = await createManualOffer(session.user.orgId, memberId, session.user.id, description);
  if (!result.ok) return result;
  revalidatePath("/offers");
  return { ok: true };
}

export async function elevateOfferAction(offerId: string): Promise<OfferActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  if (!canProposeOffers(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const result = await elevateOffer(session.user.orgId, offerId, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/offers");
  return { ok: true };
}

export async function decideOfferAction(offerId: string, approve: boolean): Promise<OfferActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canApproveOffers(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const result = await decideOffer(session.user.orgId, offerId, session.user.id, approve);
  if (!result.ok) return result;
  revalidatePath("/offers");
  return { ok: true };
}

export async function markOfferCommunicatedAction(offerId: string): Promise<OfferActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const result = await markOfferCommunicated(session.user.orgId, offerId);
  if (!result.ok) return result;
  revalidatePath("/offers");
  return { ok: true };
}

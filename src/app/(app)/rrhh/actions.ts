"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { canManageOrg } from "@/lib/rbac";
import { clockIn, clockOut, signEntry } from "@/lib/timeclock-queries";
import { submitStaffProposal, markProposalReviewed } from "@/lib/staff-proposals";
import { updateCheckinConfig } from "@/lib/checkin-schedule";
import type { ServiceKind } from "@prisma/client";

export type RrhhActionResult = { ok: true } | { ok: false; error: string };

export async function clockInAction(): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION", "HR_MANAGER"]);
  if (!session.user.centerId) return { ok: false, error: "Tu usuario no tiene centro base asignado." };
  const result = await clockIn(session.user.orgId, session.user.id, session.user.centerId);
  if (!result.ok) return result;
  revalidatePath("/rrhh");
  return { ok: true };
}

export async function clockOutAction(): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION", "HR_MANAGER"]);
  const result = await clockOut(session.user.orgId, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/rrhh");
  return { ok: true };
}

export async function signEntryAction(entryId: string): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION", "HR_MANAGER"]);
  const result = await signEntry(session.user.orgId, session.user.id, entryId);
  if (!result.ok) return result;
  revalidatePath("/rrhh");
  return { ok: true };
}

export async function submitProposalAction(formData: FormData): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION", "HR_MANAGER"]);
  const result = await submitStaffProposal(session.user.orgId, session.user.id, String(formData.get("body") ?? ""));
  if (!result.ok) return result;
  revalidatePath("/rrhh");
  return { ok: true };
}

export async function markProposalReviewedAction(proposalId: string): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "HR_MANAGER"]);
  const result = await markProposalReviewed(session.user.orgId, proposalId);
  if (!result.ok) return result;
  revalidatePath("/rrhh");
  return { ok: true };
}

export async function updateCheckinConfigAction(formData: FormData): Promise<RrhhActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canManageOrg(session.user.role) && session.user.role !== "CENTER_DIRECTOR") return { ok: false, error: "Sin permiso." };
  const serviceKind = String(formData.get("serviceKind") ?? "") as ServiceKind;
  const goalCheckinDays = Number(formData.get("goalCheckinDays") ?? 30);
  const trainerRatingDays = Number(formData.get("trainerRatingDays") ?? 90);
  await updateCheckinConfig(session.user.orgId, serviceKind, { goalCheckinDays, trainerRatingDays });
  revalidatePath("/rrhh");
  return { ok: true };
}

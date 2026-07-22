"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { canManageLeads, canManageOrg } from "@/lib/rbac";
import {
  createLead,
  assignLeadOwner,
  updateLeadStage,
  markLeadNoClose,
  addLeadNote,
  initiateLeadConversion,
  addLeadChannel,
  addNoCloseReason,
  type CreateLeadInput,
  type LeadWriteResult,
} from "@/lib/leads-queries";

export type LeadActionResult = { ok: true } | { ok: false; error: string };

export async function createLeadAction(formData: FormData): Promise<LeadWriteResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  if (!canManageLeads(session.user.role)) return { ok: false, error: "No tienes permiso para crear leads." };

  const result = await createLead({
    orgId: session.user.orgId,
    centerId: String(formData.get("centerId") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? "") || null,
    postalCode: String(formData.get("postalCode") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    hasChildren: formData.get("hasChildren") ? formData.get("hasChildren") === "yes" : null,
    sex: (String(formData.get("sex") ?? "") || null) as CreateLeadInput["sex"],
    goals: String(formData.get("goals") ?? ""),
    hasTrainedBefore: formData.get("hasTrainedBefore") === "yes",
    hasTrainedNote: String(formData.get("hasTrainedNote") ?? "") || null,
    channel: String(formData.get("channel") ?? ""),
    healthNote: String(formData.get("healthNote") ?? "") || null,
    // RB-LEAD-003: contacto presencial → responsable = quien lo atiende.
    ownerUserId: session.user.id,
    actor: { userId: session.user.id, role: session.user.role },
  });
  if (result.ok) revalidatePath("/leads");
  return result;
}

export async function assignLeadOwnerAction(leadId: string, ownerUserId: string): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const result = await assignLeadOwner(session.user.orgId, leadId, ownerUserId);
  if (!result.ok) return result;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function claimLeadAction(leadId: string): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  return assignLeadOwnerAction(leadId, session.user.id);
}

export async function updateLeadStageAction(leadId: string, status: "SEGUIMIENTO" | "CON_FECHA_VALORACION"): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const result = await updateLeadStage(session.user.orgId, leadId, status);
  if (!result.ok) return result;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function markLeadNoCloseAction(formData: FormData): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const leadId = String(formData.get("leadId") ?? "");
  const reason = String(formData.get("noCloseReason") ?? "");
  const result = await markLeadNoClose(session.user.orgId, leadId, reason);
  if (!result.ok) return result;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function addLeadNoteAction(formData: FormData): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const leadId = String(formData.get("leadId") ?? "");
  const body = String(formData.get("body") ?? "");
  const result = await addLeadNote(session.user.orgId, leadId, session.user.id, body);
  if (!result.ok) return result;
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function convertLeadAction(formData: FormData): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const leadId = String(formData.get("leadId") ?? "");
  const planId = String(formData.get("planId") ?? "") || null;
  const trainerId = String(formData.get("trainerId") ?? "") || null;
  const result = await initiateLeadConversion(session.user.orgId, leadId, { planId, trainerId });
  if (!result.ok) return result;
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/members");
  return { ok: true };
}

export async function addLeadChannelAction(formData: FormData): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  if (!canManageOrg(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const result = await addLeadChannel(session.user.orgId, String(formData.get("label") ?? ""));
  if (!result.ok) return result;
  revalidatePath("/leads");
  return { ok: true };
}

export async function addNoCloseReasonAction(formData: FormData): Promise<LeadActionResult> {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  if (!canManageOrg(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const result = await addNoCloseReason(session.user.orgId, String(formData.get("label") ?? ""));
  if (!result.ok) return result;
  revalidatePath("/leads");
  return { ok: true };
}

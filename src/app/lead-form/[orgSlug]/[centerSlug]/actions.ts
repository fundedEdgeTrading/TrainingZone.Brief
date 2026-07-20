"use server";

import { getPublicLeadFormContext } from "@/lib/public-lead-queries";
import { createLead, type LeadWriteResult } from "@/lib/leads-queries";

export async function submitPublicLead(
  orgSlug: string,
  centerSlug: string,
  formData: FormData
): Promise<LeadWriteResult> {
  const ctx = await getPublicLeadFormContext(orgSlug, centerSlug);
  if (!ctx) return { ok: false, error: "Centro no encontrado." };

  return createLead({
    orgId: ctx.organization.id,
    centerId: ctx.center.id,
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? "") || null,
    postalCode: String(formData.get("postalCode") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    hasChildren: formData.get("hasChildren") ? formData.get("hasChildren") === "yes" : null,
    goals: String(formData.get("goals") ?? ""),
    hasTrainedBefore: formData.get("hasTrainedBefore") === "yes",
    hasTrainedNote: String(formData.get("hasTrainedNote") ?? "") || null,
    channel: String(formData.get("channel") ?? ""),
    healthNote: String(formData.get("healthNote") ?? "") || null,
    ownerUserId: null, // RB-LEAD-003: entra por formulario web, pendiente de asignar
    actor: null,
  });
}

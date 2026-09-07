"use server";

import { getPublicLeadFormContext } from "@/lib/public-lead-queries";
import { createLead, type CreateLeadInput, type LeadWriteResult } from "@/lib/leads-queries";

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
    sex: (String(formData.get("sex") ?? "") || null) as CreateLeadInput["sex"],
    goals: String(formData.get("goals") ?? ""),
    hasTrainedBefore: formData.get("hasTrainedBefore") === "yes",
    hasTrainedNote: String(formData.get("hasTrainedNote") ?? "") || null,
    channel: String(formData.get("channel") ?? ""),
    // E10-12: obligatoria en el formulario público. Sin ella no se sabe si
    // quien lo rellena es menor, y `createLead` bloquea la captura de salud.
    birthDate: formData.get("birthDate") ? new Date(String(formData.get("birthDate"))) : null,
    // E10-01: sí/no en vez de texto libre, y la casilla decide si el dato de
    // salud llega a guardarse. El formulario público no manda `healthNote`.
    hasHealthCondition: formData.get("hasHealthCondition") === "yes",
    healthConsent: formData.get("healthConsent") === "yes",
    marketingConsent: formData.get("marketingConsent") === "yes",
    ownerUserId: null, // RB-LEAD-003: entra por formulario web, pendiente de asignar
    actor: null,
  });
}

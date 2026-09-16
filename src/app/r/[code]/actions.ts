"use server";

import { createLead, type CreateLeadInput, type LeadWriteResult } from "@/lib/leads-queries";
import { ensureReferralLeadChannel, REFERRAL_LEAD_CHANNEL, resolveReferralCode } from "@/lib/referrals";

/**
 * R1 (E14-30) · Quien entra por el enlace cae en LEADS —el embudo que ya
 * existe— y sigue el embudo normal. Aquí NO se construye un segundo embudo:
 * esto llama a `createLead`, el mismo de `/lead-form`, con dos cosas puestas y
 * nada más.
 *
 *  · `channel = "Referido"`. Es texto, y `LeadChannel` es configurable por
 *    dirección sin desplegar (RB-LEAD-004): no hace falta tabla ni enum.
 *  · `referredByMemberId` / `referralCodeId`. Lo ÚNICO que faltaba de verdad
 *    era de quién viene, y el código concreto por el que entró —que es lo que
 *    permite saber si el enlace estaba vivo el día en que se usó.
 *
 * El centro NO lo elige el formulario: sale del código. Si viniera del cliente,
 * cualquiera podría meter un lead en el centro que quisiera.
 */
export async function submitReferredLead(code: string, formData: FormData): Promise<LeadWriteResult> {
  // Se resuelve otra vez en el servidor, y no se confía en lo que traiga el
  // formulario: entre que se pintó la página y se envía, el socio ha podido
  // darse de baja y su código, caducar.
  const resolved = await resolveReferralCode(code);
  if (!resolved) return { ok: false, error: "Este enlace ya no está activo." };

  // El canal existe en el catálogo de la organización desde la primera vez que
  // alguien usa un enlace: así el listado de leads y la distribución por canal
  // lo agrupan con los demás en vez de enseñar un valor huérfano.
  await ensureReferralLeadChannel(resolved.orgId);

  return createLead({
    orgId: resolved.orgId,
    centerId: resolved.centerId,
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
    // No es un desplegable: por definición sabemos cómo nos ha conocido.
    channel: REFERRAL_LEAD_CHANNEL,
    // E10-12 · igual que en el formulario público: sin fecha de nacimiento no
    // hay forma de saber que quien deja un dato de salud aquí es menor.
    birthDate: formData.get("birthDate") ? new Date(String(formData.get("birthDate"))) : null,
    hasHealthCondition: formData.get("hasHealthCondition") === "yes",
    healthConsent: formData.get("healthConsent") === "yes",
    marketingConsent: formData.get("marketingConsent") === "yes",
    // RB-LEAD-003: entra por web, pendiente de asignar.
    ownerUserId: null,
    actor: null,
    referredByMemberId: resolved.referrerMemberId,
    referralCodeId: resolved.codeId,
  });
}

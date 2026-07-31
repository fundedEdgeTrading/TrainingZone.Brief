"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

function optional(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/**
 * Autoservicio del socio sobre su propia ficha: solo datos de contacto y
 * foto. Nombre/apellidos/email/fecha de nacimiento no se tocan aquí — son
 * identidad, no contacto, y su cambio pasa por dirección.
 */
export async function updateMyProfileAction(formData: FormData): Promise<ProfileActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const phone = optional(formData, "phone");
  if (phone && !/^[+\d][\d\s-]{5,}$/.test(phone)) {
    return { ok: false, error: "El teléfono no tiene un formato válido." };
  }

  const photoUrl = optional(formData, "photoUrl");

  await prisma.member.update({
    where: { id: member.id },
    data: {
      phone,
      address: optional(formData, "address"),
      addressLine2: optional(formData, "addressLine2"),
      city: optional(formData, "city"),
      province: optional(formData, "province"),
      country: optional(formData, "country"),
      emergencyContact: optional(formData, "emergencyContact"),
      ...(photoUrl !== null ? { photoUrl } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBER_SELF_UPDATED_CONTACT",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
    },
  });

  revalidatePath("/portal/perfil");
  return { ok: true };
}

const CONSENT_FIELD = {
  health: { flag: "consentHealth", at: "consentHealthAt" },
  images: { flag: "consentImages", at: "consentImagesAt" },
  marketing: { flag: "consentMarketing", at: "consentMarketingAt" },
} as const;

export type ConsentKind = keyof typeof CONSENT_FIELD;

/**
 * Retirar/dar consentimiento (RGPD, tan fácil como se dio). Revocar salud o
 * imágenes SOLO detiene la captura futura (ver los checks en
 * members/[id]/actions.ts) — no borra registros ya existentes, es una
 * decisión de retención que corresponde a dirección, no a este botón.
 */
export async function updateMyConsentAction(kind: ConsentKind, granted: boolean): Promise<ProfileActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const fields = CONSENT_FIELD[kind];
  if (!fields) return { ok: false, error: "Consentimiento no reconocido." };

  await prisma.member.update({
    where: { id: member.id },
    data: { [fields.flag]: granted, [fields.at]: granted ? new Date() : null },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: granted ? "CONSENT_GRANTED" : "CONSENT_REVOKED",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
    },
  });

  revalidatePath("/portal/perfil");
  return { ok: true };
}

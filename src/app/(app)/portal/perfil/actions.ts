"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getMemberForUser } from "@/lib/portal-queries";
import { CONSENT_VERSION } from "@/lib/consent";

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
  ai: { flag: "consentAI", at: "consentAIAt" },
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

/**
 * Re-consentimiento del texto vigente (F3 §4.4). El texto anterior prometía que
 * los datos no se cederían a terceros, y tratarlos con un proveedor de IA —aun
 * como encargado del tratamiento— no cabe ahí: hay que volver a recogerlo. El
 * aviso no bloquea el acceso, y decir que no a la IA es una respuesta válida que
 * se guarda como tal, no una casilla decorativa.
 */
export async function acceptCurrentConsentAction(consentAI: boolean): Promise<ProfileActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const now = new Date();
  await prisma.member.update({
    where: { id: member.id },
    data: {
      consentVersion: CONSENT_VERSION,
      consentAI,
      consentAIAt: consentAI ? now : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "CONSENT_VERSION_ACCEPTED",
      entityType: "Member",
      entityId: member.id,
      memberId: member.id,
      metadata: { version: CONSENT_VERSION, consentAI },
    },
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}

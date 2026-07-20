"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createHealthRecord, resolveHealthRecord } from "@/lib/health-access";
import { canManageMembers } from "@/lib/rbac";
import { generateInvitationToken, invitationExpiry, onboardingUrlFor } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import type { HealthRecordType, HealthSeverity } from "@prisma/client";

const HEALTH_TYPES: HealthRecordType[] = [
  "INJURY",
  "CHRONIC_CONDITION",
  "MEDICATION",
  "SURGERY",
  "PREGNANCY",
  "ALLERGY",
];
const SEVERITIES: HealthSeverity[] = ["LOW", "MEDIUM", "HIGH"];

export type MemberActionResult = { ok: true } | { ok: false; error: string };

// Alta de lesión / condición. El acceso real (permiso + consentimiento +
// auditoría) lo aplica lib/health-access.ts; aquí solo se validan las entradas.
export async function addHealthRecord(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  const memberId = String(formData.get("memberId") ?? "");
  const typeRaw = String(formData.get("type") ?? "");
  const severityRaw = String(formData.get("severity") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const zone = String(formData.get("zone") ?? "").trim() || null;

  const type = HEALTH_TYPES.includes(typeRaw as HealthRecordType) ? (typeRaw as HealthRecordType) : null;
  const severity = SEVERITIES.includes(severityRaw as HealthSeverity) ? (severityRaw as HealthSeverity) : null;
  if (!memberId || !type || !severity || !description) {
    return { ok: false, error: "Completa el tipo, la severidad y la descripción." };
  }

  await createHealthRecord({
    memberId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    input: { type, zone: type === "INJURY" ? zone : null, description, severity },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function resolveHealthRecordAction(recordId: string, memberId: string): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);

  await resolveHealthRecord({
    recordId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// Bitácora (observaciones no clínicas): cualquier rol de staff puede anotar.
export async function addMemberNote(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);

  const memberId = String(formData.get("memberId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!memberId || !body) return { ok: false, error: "Escribe una observación antes de guardar." };

  // El socio debe pertenecer a la organización del actor (aislamiento tenant).
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };

  await prisma.memberNote.create({
    data: { orgId: session.user.orgId, memberId, authorUserId: session.user.id, body },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// Datos de contacto (pestaña "Datos"). Los consentimientos NO se editan aquí
// — los firma el propio socio en su onboarding.
export async function updateMemberContact(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const memberId = String(formData.get("memberId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const birthRaw = String(formData.get("birthDate") ?? "").trim();
  const emergencyContact = String(formData.get("emergencyContact") ?? "").trim() || null;
  if (!memberId || !email) return { ok: false, error: "El email es obligatorio." };

  const member = await prisma.member.findFirst({ where: { id: memberId, orgId: session.user.orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };

  await prisma.member.update({
    where: { id: memberId },
    data: { email, phone, address, emergencyContact, birthDate: birthRaw ? new Date(birthRaw) : null },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function updateMemberPhoto(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const memberId = String(formData.get("memberId") ?? "");
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;
  if (!memberId) return { ok: false, error: "Falta el socio." };

  const member = await prisma.member.findFirst({ where: { id: memberId, orgId: session.user.orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };

  await prisma.member.update({ where: { id: memberId }, data: { photoUrl } });
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// Fotos y evolución: gateado por consentimiento de uso de imágenes (Art. 9 RGPD, opcional).
export async function createProgressEntry(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return { ok: false, error: "Falta el socio." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, consentImages: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!member.consentImages) {
    return { ok: false, error: "Este socio no ha firmado el consentimiento de uso de imágenes." };
  }

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
    return raw ? Number(raw) : null;
  };
  const str = (key: string) => String(formData.get(key) ?? "").trim() || null;

  await prisma.memberProgressEntry.create({
    data: {
      memberId,
      weightKg: num("weightKg"),
      bodyFatPct: num("bodyFatPct"),
      waistCm: num("waistCm"),
      photoFrontUrl: str("photoFrontUrl"),
      photoSideUrl: str("photoSideUrl"),
      photoBackUrl: str("photoBackUrl"),
    },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// Reenvío del email de bienvenida: regenera el token de un solo uso y lo
// vuelve a mandar. Solo tiene sentido si el socio aún no ha completado el
// onboarding (member.userId sigue null).
export async function resendMemberWelcome(memberId: string): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  if (!canManageMembers(session.user.role)) return { ok: false, error: "No tienes permiso para reenviar la bienvenida." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    include: { primaryCenter: { select: { name: true } } },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (member.userId) return { ok: false, error: "Este socio ya completó su acceso." };

  const token = generateInvitationToken();
  const expiresAt = invitationExpiry();
  await prisma.invitation.upsert({
    where: { memberId },
    create: { orgId: session.user.orgId, type: "MEMBER", token, email: member.email, memberId, expiresAt },
    update: { token, expiresAt, usedAt: null },
  });

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true, logoUrl: true } });
  await sendMail({
    to: member.email,
    subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}, ${member.firstName}! 🎉 Tu acceso te espera`,
    html: renderMemberWelcomeEmail({
      memberFirstName: member.firstName,
      orgName: org?.name ?? "Training Zone",
      orgLogoUrl: org?.logoUrl || "/brand/tz-logo-white.png",
      centerName: member.primaryCenter.name,
      onboardingUrl: onboardingUrlFor(token),
    }),
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createHealthRecord, resolveHealthRecord } from "@/lib/health-access";
import { canManageMembers } from "@/lib/rbac";
import { generateInvitationToken, invitationExpiry, onboardingUrlFor } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import { Prisma, type HealthRecordType, type HealthSeverity } from "@prisma/client";

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

// Fotos + composición corporal. Dos consentimientos independientes (docs/COMPOSICION_CORPORAL_
// IMPLEMENTACION.md CC1.2): las fotos siguen gateadas por consentImages; las métricas de
// composición (peso, % graso, bioimpedancia) son dato de salud Art. 9 y se gatean por
// consentHealth, igual que HealthRecord — pueden guardarse sin foto y sin consentImages.
const COMPOSITION_NUM_FIELDS = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "muscleMassKg",
  "fatMassKg",
  "fatFreeMassKg",
  "bodyWaterPct",
  "boneMassKg",
  "bmi",
] as const;
const COMPOSITION_INT_FIELDS = ["visceralFatRating", "muscleQuality", "bmrKcal", "metabolicAge"] as const;

export async function createProgressEntry(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return { ok: false, error: "Falta el socio." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, consentImages: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
    return raw ? Number(raw) : null;
  };
  const int = (key: string) => {
    const n = num(key);
    return n != null ? Math.round(n) : null;
  };
  const str = (key: string) => String(formData.get(key) ?? "").trim() || null;

  const numValues = Object.fromEntries(COMPOSITION_NUM_FIELDS.map((k) => [k, num(k)]));
  const intValues = Object.fromEntries(COMPOSITION_INT_FIELDS.map((k) => [k, int(k)]));
  const photos = { photoFrontUrl: str("photoFrontUrl"), photoSideUrl: str("photoSideUrl"), photoBackUrl: str("photoBackUrl") };

  const hasMetrics = Object.values(numValues).some((v) => v != null) || Object.values(intValues).some((v) => v != null);
  const hasPhotos = Object.values(photos).some((v) => v != null);
  if (!hasMetrics && !hasPhotos) return { ok: false, error: "Introduce al menos un dato." };
  if (hasPhotos && !member.consentImages) {
    return { ok: false, error: "Este socio no ha firmado el consentimiento de uso de imágenes." };
  }
  if (hasMetrics && !member.consentHealth) {
    return { ok: false, error: "Este socio no ha firmado el consentimiento de datos de salud (Art. 9 RGPD)." };
  }

  const entry = await prisma.memberProgressEntry.create({
    data: { memberId, ...numValues, ...intValues, ...photos, source: "MANUAL" },
  });

  if (hasMetrics) {
    await prisma.auditLog.create({
      data: {
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "BODY_COMPOSITION_RECORDED",
        entityType: "MemberProgressEntry",
        entityId: entry.id,
        memberId,
        metadata: { source: "MANUAL" },
      },
    });
  }

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// CC5 (docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md): la app My Tanita no exporta CSV, solo el
// texto que comparte tras cada medición. En vez de un parser de fichero, el entrenador pega ese
// texto y aquí se interpreta (src/lib/tanita-parse.ts) para crear la toma con source "TANITA".
export async function importTanitaText(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const memberId = String(formData.get("memberId") ?? "");
  const rawText = String(formData.get("rawText") ?? "");
  if (!memberId || !rawText.trim()) return { ok: false, error: "Pega el texto de la medición." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!member.consentHealth) {
    return { ok: false, error: "Este socio no ha firmado el consentimiento de datos de salud (Art. 9 RGPD)." };
  }

  const { parseTanitaText } = await import("@/lib/tanita-parse");
  const parsed = parseTanitaText(rawText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { segmental, ...metrics } = parsed.data;
  const entry = await prisma.memberProgressEntry.create({
    data: { memberId, ...metrics, segmental: segmental ?? Prisma.DbNull, source: "TANITA", measuredAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "BODY_COMPOSITION_RECORDED",
      entityType: "MemberProgressEntry",
      entityId: entry.id,
      memberId,
      metadata: { source: "TANITA" },
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

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, memberIsInScope, centerIsInScope, OUT_OF_CENTER_SCOPE, CENTER_OUT_OF_SCOPE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { createHealthRecord, resolveHealthRecord } from "@/lib/health-access";
import { canDeleteMembers, canManageMembers } from "@/lib/rbac";
import { generateInvitationToken, invitationExpiry, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { Prisma, type HealthRecordType, type HealthSeverity, type Sex } from "@prisma/client";

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
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);

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
  if (!(await memberIsInScope(session.user, memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

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
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);

  // El ámbito se comprueba sobre el socio DEL REGISTRO, no sobre el `memberId`
  // que llega del cliente (que solo se usa para revalidar la ruta): si no, bastaba
  // con mandar un socio propio junto al id de un registro ajeno.
  // `HealthRecord` no lleva `orgId`: cuelga del socio (o de un lead), así que el
  // aislamiento por organización se pide a través de la relación.
  const record = await prisma.healthRecord.findFirst({
    where: { id: recordId, member: { orgId: session.user.orgId } },
    select: { memberId: true },
  });
  if (!record?.memberId) return { ok: false, error: "No se ha encontrado ese registro." };
  if (!(await memberIsInScope(session.user, record.memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

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
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);

  const memberId = String(formData.get("memberId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!memberId || !body) return { ok: false, error: "Escribe una observación antes de guardar." };

  // El socio debe pertenecer a la organización del actor (aislamiento tenant).
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  await prisma.memberNote.create({
    data: { orgId: session.user.orgId, memberId, authorUserId: session.user.id, body },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

// Ficha del socio (sección "Socio"): identidad, dirección postal y contacto.
// Los consentimientos NO se editan aquí — los firma el propio socio en su
// onboarding. El estado (ACTIVE/FROZEN/...) tampoco: lo derivan las
// suscripciones (lib/subscription-jobs.ts, billing/subscription-actions.ts).
const SEXES: Sex[] = ["FEMALE", "MALE", "OTHER"];
const POSTAL_CODE_RE = /^\d{5}$/; // CP español, 5 dígitos (mismo criterio que RB-LEAD-010)

export async function updateMemberData(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const optional = (key: string) => text(key) || null;

  const memberId = text("memberId");
  const firstName = text("firstName");
  const lastName = text("lastName");
  const email = text("email").toLowerCase();
  const birthRaw = text("birthDate");
  const sexRaw = text("sex");
  const postalCode = optional("postalCode");
  const centerId = text("centerId");

  if (!memberId || !firstName || !lastName || !email) {
    return { ok: false, error: "Completa el nombre, los apellidos y el email." };
  }
  if (postalCode && !POSTAL_CODE_RE.test(postalCode)) {
    return { ok: false, error: "El código postal debe tener 5 dígitos." };
  }
  const birthDate = birthRaw ? new Date(birthRaw) : null;
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    return { ok: false, error: "La fecha de nacimiento no es válida." };
  }
  if (sexRaw && !SEXES.includes(sexRaw as Sex)) return { ok: false, error: "El sexo indicado no es válido." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, primaryCenterId: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  // El email identifica al socio dentro de la organización (y es su login en el
  // portal): no puede chocar con el de otro socio del mismo tenant.
  const dup = await prisma.member.findFirst({
    where: { orgId: session.user.orgId, email, id: { not: memberId } },
    select: { id: true },
  });
  if (dup) return { ok: false, error: "Ya existe otro socio con ese email." };

  let primaryCenterId = member.primaryCenterId;
  if (centerId && centerId !== member.primaryCenterId) {
    const center = await prisma.center.findFirst({
      where: { id: centerId, orgId: session.user.orgId },
      select: { id: true },
    });
    if (!center) return { ok: false, error: "No se ha encontrado ese centro." };
    // Mover un socio a un centro ajeno equivale a sacárselo de las manos a quien
    // sí lo lleva (y a metérselo a otro): solo a centros propios.
    if (!(await centerIsInScope(session.user, center.id))) return { ok: false, error: CENTER_OUT_OF_SCOPE };
    primaryCenterId = center.id;
  }

  await prisma.member.update({
    where: { id: memberId },
    data: {
      firstName,
      lastName,
      email,
      phone: optional("phone"),
      birthDate,
      sex: sexRaw ? (sexRaw as Sex) : null,
      occupation: optional("occupation"),
      address: optional("address"),
      addressLine2: optional("addressLine2"),
      postalCode,
      city: optional("city"),
      province: optional("province"),
      country: optional("country"),
      emergencyContact: optional("emergencyContact"),
      primaryCenterId,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "MEMBER_UPDATED",
      entityType: "Member",
      entityId: memberId,
      memberId,
    },
  });

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
  return { ok: true };
}

// RB-AGENDA-003: añade un bono más a un socio que ya tiene ficha (EP y
// grupos pueden convivir, en centros distintos de la misma organización). El
// cálculo de priceCents/sessionsRemaining es el mismo de un renglón en el
// alta (createBonoSubscription en lib/invitations.ts) pero son dos líneas
// triviales — no se ha extraído a un módulo compartido para no crear una
// abstracción de una sola llamada.
const addSubscriptionSchema = z.object({
  memberId: z.string().min(1),
  planId: z.string().min(1),
  centerId: z.string().min(1),
});

export async function addSubscription(formData: FormData): Promise<MemberActionResult> {
  // Mismo conjunto de roles que el resto de acciones de suscripción de esta
  // página (billing/subscription-actions.ts::ALLOWED_ROLES).
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);

  const parsed = addSubscriptionSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    planId: String(formData.get("planId") ?? ""),
    centerId: String(formData.get("centerId") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Selecciona un plan y un centro." };

  const member = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, orgId: session.user.orgId },
    select: { id: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  const [plan, center] = await Promise.all([
    prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, orgId: session.user.orgId } }),
    prisma.center.findFirst({ where: { id: parsed.data.centerId, orgId: session.user.orgId }, select: { id: true } }),
  ]);
  if (!plan) return { ok: false, error: "No se ha encontrado ese plan." };
  if (!center) return { ok: false, error: "No se ha encontrado ese centro." };
  if (!(await centerIsInScope(session.user, center.id))) return { ok: false, error: CENTER_OUT_OF_SCOPE };

  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: plan.priceCents,
      status: "ACTIVE",
      sessionsRemaining: plan.sessionsIncluded ?? null,
      sessionsIncluded: plan.sessionsIncluded ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "SUBSCRIPTION_ADDED",
      entityType: "Subscription",
      entityId: subscription.id,
      memberId: member.id,
      metadata: { planId: plan.id, centerId: center.id, priceCents: plan.priceCents },
    },
  });

  revalidatePath("/billing");
  revalidatePath(`/members/${member.id}`);
  return { ok: true };
}

// Baja definitiva del socio (C4 — derecho de supresión del RGPD). Reglas:
//  · solo dirección (canDeleteMembers);
//  · nunca con una suscripción viva (ACTIVE o FROZEN, que es una activa en
//    pausa): primero hay que cancelarla desde "Plan y pagos";
//  · borra en cascada manual todo lo que cuelga del socio — el esquema no
//    declara onDelete, así que el orden importa (hijos antes que padres);
//  · el AuditLog no tiene FK a Member: se conserva como registro append-only
//    (ADR-008) y se le añade la entrada MEMBER_DELETED.
export async function deleteMember(memberId: string): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canDeleteMembers(session.user.role)) return { ok: false, error: "No tienes permiso para eliminar socios." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
      subscriptions: { where: { status: { in: ["ACTIVE", "FROZEN"] } }, select: { id: true } },
    },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  if (member.subscriptions.length > 0) {
    return {
      ok: false,
      error: "Este socio tiene una suscripción activa. Cancélala desde «Plan y pagos» antes de eliminarlo.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.sessionDebrief.deleteMany({ where: { booking: { memberId } } });
      await tx.booking.deleteMany({ where: { memberId } });
      await tx.payment.deleteMany({ where: { memberId } });
      await tx.chatMessage.deleteMany({ where: { conversation: { memberId } } });
      await tx.conversation.deleteMany({ where: { memberId } });
      await tx.announcementView.deleteMany({ where: { memberId } });
      await tx.trainerRating.deleteMany({ where: { memberId } });
      await tx.selfAssessment.deleteMany({ where: { memberId } });
      await tx.workoutProgram.deleteMany({ where: { memberId } });
      await tx.retentionAlert.deleteMany({ where: { memberId } });
      await tx.healthRecord.deleteMany({ where: { memberId } });
      await tx.clientFeedback.deleteMany({ where: { memberId } });
      await tx.trainerDebrief.deleteMany({ where: { memberId } });
      await tx.clientGoal.deleteMany({ where: { memberId } });
      await tx.memberNote.deleteMany({ where: { memberId } });
      await tx.memberProgressEntry.deleteMany({ where: { memberId } });
      await tx.subscription.deleteMany({ where: { memberId } });
      await tx.invitation.deleteMany({ where: { memberId } });
      // El lead de origen sobrevive al socio: solo se suelta el enlace (@unique).
      await tx.lead.updateMany({ where: { convertedMemberId: memberId }, data: { convertedMemberId: null } });
      await tx.member.delete({ where: { id: memberId } });

      // Cuenta del portal del socio: se borra con él para que no quede un login
      // huérfano. Su rastro en el log de auditoría se conserva anonimizado.
      if (member.userId) {
        await tx.notification.deleteMany({ where: { recipientUserId: member.userId } });
        await tx.chatMessage.updateMany({ where: { senderUserId: member.userId }, data: { senderUserId: null } });
        await tx.invitation.deleteMany({ where: { userId: member.userId } });
        await tx.auditLog.updateMany({ where: { actorUserId: member.userId }, data: { actorUserId: null } });
        await tx.user.delete({ where: { id: member.userId } });
      }

      await tx.auditLog.create({
        data: {
          orgId: session.user.orgId,
          actorUserId: session.user.id,
          action: "MEMBER_DELETED",
          entityType: "Member",
          entityId: memberId,
          memberId,
          metadata: { name: `${member.firstName} ${member.lastName}`.trim(), email: member.email },
        },
      });
    });
  } catch (error) {
    console.error("deleteMember", error);
    return { ok: false, error: "No se ha podido eliminar el socio. Revisa que no tenga operaciones en curso." };
  }

  revalidatePath("/members");
  return { ok: true };
}

export async function updateMemberPhoto(formData: FormData): Promise<MemberActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const memberId = String(formData.get("memberId") ?? "");
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;
  if (!memberId) return { ok: false, error: "Falta el socio." };

  const member = await prisma.member.findFirst({ where: { id: memberId, orgId: session.user.orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

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
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return { ok: false, error: "Falta el socio." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, consentImages: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

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
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const memberId = String(formData.get("memberId") ?? "");
  const rawText = String(formData.get("rawText") ?? "");
  if (!memberId || !rawText.trim()) return { ok: false, error: "Pega el texto de la medición." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, consentHealth: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
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
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  if (!canManageMembers(session.user.role)) return { ok: false, error: "No tienes permiso para reenviar la bienvenida." };

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    include: { primaryCenter: { select: { name: true, address: true } } },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  if (member.userId) return { ok: false, error: "Este socio ya completó su acceso." };

  const token = generateInvitationToken();
  const expiresAt = invitationExpiry();
  await prisma.invitation.upsert({
    where: { memberId },
    create: { orgId: session.user.orgId, type: "MEMBER", token, email: member.email, memberId, expiresAt },
    update: { token, expiresAt, usedAt: null },
  });

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true, logoUrl: true } });
  const footer = memberEmailFooterLinks(member.id);
  // Email de bienvenida no bloqueante: la invitación ya está guardada, un SMTP lento no debe colgar la acción.
  void sendMail({
    to: member.email,
    fromName: org?.name ?? "Training Zone",
    subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}, ${member.firstName}! 🎉 Tu acceso te espera`,
    html: renderMemberWelcomeEmail({
      memberFirstName: member.firstName,
      orgName: org?.name ?? "Training Zone",
      orgLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      centerName: member.primaryCenter.name,
      onboardingUrl: onboardingUrlFor(token),
      memberFullName: `${member.firstName} ${member.lastName}`,
      postalAddress: member.primaryCenter.address ?? undefined,
      prefsToken: footer.token,
    }),
    unsubscribeUrl: footer.oneClickUnsubscribeUrl,
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

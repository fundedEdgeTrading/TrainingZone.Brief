"use server";

import { prisma } from "@/lib/prisma";
import { MIN_PASSWORD_LENGTH, ensureIdentity, hashPassword, setPassword } from "@/lib/identity";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

const CONSENT_VERSION = "2026-07-v1";

function invitationInvalidError(reason: "notfound" | "used" | "expired" | "type"): string | null {
  switch (reason) {
    case "notfound":
      return "Este enlace no es válido.";
    case "used":
      return "Este enlace ya se ha utilizado.";
    case "expired":
      return "Este enlace ha caducado. Pide que te reenvíen la invitación.";
    case "type":
      return "Este enlace no corresponde a este tipo de cuenta.";
    default:
      return null;
  }
}

export async function completeStaffOnboarding(token: string, password: string): Promise<OnboardingResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, error: invitationInvalidError("notfound")! };
  // El director activa por el mismo camino que el personal: solo contraseña.
  if (invitation.type !== "STAFF" && invitation.type !== "OWNER") {
    return { ok: false, error: invitationInvalidError("type")! };
  }
  if (invitation.usedAt) return { ok: false, error: invitationInvalidError("used")! };
  if (invitation.expiresAt < new Date()) return { ok: false, error: invitationInvalidError("expired")! };
  if (!invitation.userId) return { ok: false, error: invitationInvalidError("notfound")! };

  const membership = await prisma.user.findUnique({
    where: { id: invitation.userId },
    select: { identityId: true },
  });
  if (!membership) return { ok: false, error: invitationInvalidError("notfound")! };

  await setPassword(membership.identityId, password);
  await prisma.invitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } });

  return { ok: true };
}

export async function completeMemberOnboarding(
  token: string,
  input: { password?: string; consentHealth: boolean; consentImages: boolean; consentMarketing: boolean; sex?: "FEMALE" | "MALE" | "OTHER" | "" }
): Promise<OnboardingResult> {
  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, error: invitationInvalidError("notfound")! };
  if (invitation.type !== "MEMBER") return { ok: false, error: invitationInvalidError("type")! };
  if (invitation.usedAt) return { ok: false, error: invitationInvalidError("used")! };
  if (invitation.expiresAt < new Date()) return { ok: false, error: invitationInvalidError("expired")! };
  if (!invitation.memberId) return { ok: false, error: invitationInvalidError("notfound")! };

  const member = await prisma.member.findUnique({ where: { id: invitation.memberId } });
  if (!member) return { ok: false, error: invitationInvalidError("notfound")! };
  if (member.userId) return { ok: false, error: invitationInvalidError("used")! };

  const now = new Date();

  // RB-ID-003: si este email ya tenía credencial en Apta (p. ej. es socio de
  // otro gimnasio) no se le vuelve a pedir contraseña; se reutiliza la suya.
  const existingIdentity = await prisma.identity.findUnique({
    where: { email: member.email.trim().toLowerCase() },
    select: { passwordSetAt: true },
  });
  const mustSetPassword = !existingIdentity?.passwordSetAt;
  if (mustSetPassword && (!input.password || input.password.length < MIN_PASSWORD_LENGTH)) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  await prisma.$transaction(async (tx) => {
    const identity = await ensureIdentity(tx, {
      email: member.email,
      ...(mustSetPassword ? { passwordHash: await hashPassword(input.password!) } : {}),
    });
    if (mustSetPassword) {
      await tx.identity.update({ where: { id: identity.id }, data: { passwordSetAt: now } });
    }

    // Puede existir ya una membresía de esta identidad en esta organización
    // (alguien del equipo que se apunta como socio, o una segunda invitación).
    // Se reutiliza: el índice único (orgId, email) impide duplicarla, y el
    // acceso al portal se resuelve por tener ficha de socio, no por el rol.
    const existingMembership = await tx.user.findFirst({
      where: { orgId: member.orgId, identityId: identity.id },
      select: { id: true },
    });
    const user =
      existingMembership ??
      (await tx.user.create({
        data: {
          identityId: identity.id,
          orgId: member.orgId,
          centerId: member.primaryCenterId,
          name: `${member.firstName} ${member.lastName}`.trim(),
          email: identity.email,
          role: "MEMBER",
        },
      }));
    await tx.member.update({
      where: { id: member.id },
      data: {
        userId: user.id,
        state: member.state === "PROSPECT" ? "TRIAL" : member.state,
        // BI-2/RB-BI-005: solo se sobrescribe si el socio elige una opción (no pisa lo heredado del lead).
        ...(input.sex ? { sex: input.sex } : {}),
        consentContract: true,
        consentContractAt: now,
        consentHealth: input.consentHealth,
        consentHealthAt: input.consentHealth ? now : null,
        consentImages: input.consentImages,
        consentImagesAt: input.consentImages ? now : null,
        consentMarketing: input.consentMarketing,
        consentMarketingAt: input.consentMarketing ? now : null,
        consentVersion: CONSENT_VERSION,
      },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { usedAt: now } });
  });

  return { ok: true };
}

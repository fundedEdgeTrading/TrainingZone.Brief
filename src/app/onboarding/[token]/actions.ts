"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };

  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, error: invitationInvalidError("notfound")! };
  if (invitation.type !== "STAFF") return { ok: false, error: invitationInvalidError("type")! };
  if (invitation.usedAt) return { ok: false, error: invitationInvalidError("used")! };
  if (invitation.expiresAt < new Date()) return { ok: false, error: invitationInvalidError("expired")! };
  if (!invitation.userId) return { ok: false, error: invitationInvalidError("notfound")! };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: invitation.userId }, data: { passwordHash } }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } }),
  ]);

  return { ok: true };
}

export async function completeMemberOnboarding(
  token: string,
  input: { password: string; consentHealth: boolean; consentImages: boolean; consentMarketing: boolean }
): Promise<OnboardingResult> {
  if (input.password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };

  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, error: invitationInvalidError("notfound")! };
  if (invitation.type !== "MEMBER") return { ok: false, error: invitationInvalidError("type")! };
  if (invitation.usedAt) return { ok: false, error: invitationInvalidError("used")! };
  if (invitation.expiresAt < new Date()) return { ok: false, error: invitationInvalidError("expired")! };
  if (!invitation.memberId) return { ok: false, error: invitationInvalidError("notfound")! };

  const member = await prisma.member.findUnique({ where: { id: invitation.memberId } });
  if (!member) return { ok: false, error: invitationInvalidError("notfound")! };
  if (member.userId) return { ok: false, error: invitationInvalidError("used")! };

  const passwordHash = await bcrypt.hash(input.password, 10);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        orgId: member.orgId,
        centerId: member.primaryCenterId,
        name: `${member.firstName} ${member.lastName}`.trim(),
        email: member.email,
        passwordHash,
        role: "MEMBER",
        authProvider: "demo",
      },
    });
    await tx.member.update({
      where: { id: member.id },
      data: {
        userId: user.id,
        state: member.state === "PROSPECT" ? "TRIAL" : member.state,
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

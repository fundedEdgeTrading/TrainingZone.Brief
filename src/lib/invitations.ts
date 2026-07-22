import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma, type Role, type Sex } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const INVITATION_TTL_DAYS = 7;

export function generateInvitationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function invitationExpiry() {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function onboardingUrlFor(token: string) {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/onboarding/${token}`;
}

// Contraseña aleatoria e inutilizable: la cuenta queda "creada pero
// bloqueada" hasta que la persona complete el onboarding con su enlace.
async function unusablePasswordHash() {
  return bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
}

export async function createStaffWithInvitation(
  tx: Tx,
  params: { orgId: string; name: string; email: string; role: Role; centerId: string | null }
) {
  const passwordHash = await unusablePasswordHash();
  const user = await tx.user.create({
    data: {
      orgId: params.orgId,
      centerId: params.centerId,
      name: params.name,
      email: params.email,
      passwordHash,
      role: params.role,
      authProvider: "demo",
    },
  });
  const invitation = await tx.invitation.create({
    data: {
      orgId: params.orgId,
      type: "STAFF",
      token: generateInvitationToken(),
      email: params.email,
      userId: user.id,
      expiresAt: invitationExpiry(),
    },
  });
  return { user, invitation };
}

export async function createMemberWithInvitation(
  tx: Tx,
  params: {
    orgId: string;
    primaryCenterId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    birthDate?: Date | null;
    planId?: string | null;
    // F9 (RB-PERFIL): perfil extendido heredado del lead de origen (F8), si aplica.
    postalCode?: string | null;
    occupation?: string | null;
    hasChildren?: boolean | null;
    sex?: Sex | null; // BI-2/RB-BI-005: heredado del lead de origen si se respondió
    channel?: string | null;
    originLeadId?: string | null;
    trainerId?: string | null;
  }
) {
  const member = await tx.member.create({
    data: {
      orgId: params.orgId,
      primaryCenterId: params.primaryCenterId,
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      phone: params.phone ?? null,
      birthDate: params.birthDate ?? null,
      state: "TRIAL",
      postalCode: params.postalCode ?? null,
      occupation: params.occupation ?? null,
      hasChildren: params.hasChildren ?? null,
      sex: params.sex ?? null,
      channel: params.channel ?? null,
      originLeadId: params.originLeadId ?? null,
      trainerId: params.trainerId ?? null,
    },
  });

  if (params.planId) {
    const plan = await tx.membershipPlan.findFirst({ where: { id: params.planId, orgId: params.orgId } });
    if (plan) {
      await tx.subscription.create({
        data: {
          memberId: member.id,
          planId: plan.id,
          startDate: new Date(),
          priceCents: plan.priceCents,
          status: "ACTIVE",
          sessionsRemaining: plan.sessionsIncluded ?? null,
        },
      });
    }
  }

  const invitation = await tx.invitation.create({
    data: {
      orgId: params.orgId,
      type: "MEMBER",
      token: generateInvitationToken(),
      email: params.email,
      memberId: member.id,
      expiresAt: invitationExpiry(),
    },
  });
  return { member, invitation };
}

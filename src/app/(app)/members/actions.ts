"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { canManageMembers, canManageOrg } from "@/lib/rbac";
import { createMemberWithInvitation, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import {
  assignClientGoal,
  markClientGoalAchieved,
  addClientGoalTemplate,
} from "@/lib/members-queries";

export type MembersActionResult = { ok: true } | { ok: false; error: string };

// Cada fila del bloque "Bonos" del alta manda un par (plan, centro) como
// entradas paralelas `bonoPlanId`/`bonoCenterId` — mismo idioma que el
// `formData.getAll("paymentId")` ya usado en subscription-actions.ts para
// listas, en vez de inventar una notación `bono[0][planId]`.
const bonoSchema = z.object({ planId: z.string().min(1), centerId: z.string().min(1) });

export async function createMember(formData: FormData): Promise<MembersActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  if (!canManageMembers(session.user.role)) return { ok: false, error: "No tienes permiso para dar de alta socios." };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const birthRaw = String(formData.get("birthDate") ?? "").trim();
  const centerId = String(formData.get("centerId") ?? "");
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;

  if (!firstName || !lastName || !email || !centerId) {
    return { ok: false, error: "Completa el nombre, apellidos, email y centro." };
  }

  const bonoPlanIds = formData.getAll("bonoPlanId").map(String);
  const bonoCenterIds = formData.getAll("bonoCenterId").map(String);
  const bonosParsed = z
    .array(bonoSchema)
    .safeParse(bonoPlanIds.map((planId, i) => ({ planId, centerId: bonoCenterIds[i] ?? "" })));
  if (!bonosParsed.success) return { ok: false, error: "Cada bono necesita un plan y un centro." };

  const center = await prisma.center.findFirst({
    where: { id: centerId, orgId: session.user.orgId },
    select: { id: true, name: true, address: true },
  });
  if (!center) return { ok: false, error: "No se ha encontrado ese centro." };

  const dup = await prisma.member.findFirst({ where: { orgId: session.user.orgId, email }, select: { id: true } });
  if (dup) return { ok: false, error: "Ya existe un socio con ese email." };

  const birthDate = birthRaw ? new Date(birthRaw) : null;

  const { member, invitation } = await prisma.$transaction((tx) =>
    createMemberWithInvitation(tx, {
      orgId: session.user.orgId,
      primaryCenterId: center.id,
      firstName,
      lastName,
      email,
      phone,
      birthDate,
      bonos: bonosParsed.data,
    })
  );

  if (photoUrl) {
    await prisma.member.update({ where: { id: member.id }, data: { photoUrl } });
  }

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true, logoUrl: true } });
  const footer = memberEmailFooterLinks(member.id);
  // Email de bienvenida no bloqueante: el socio ya está guardado, un SMTP lento no debe colgar el alta.
  void sendMail({
    to: email,
    // RB-MARCA-001: el socio no ha comprado Apta, ha comprado su gimnasio.
    fromName: org?.name ?? "Training Zone",
    subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}, ${firstName}! 🎉 Tu acceso te espera`,
    html: renderMemberWelcomeEmail({
      memberFirstName: firstName,
      orgName: org?.name ?? "Training Zone",
      orgLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      centerName: center.name,
      onboardingUrl: onboardingUrlFor(invitation.token),
      memberFullName: `${firstName} ${lastName}`,
      postalAddress: center.address ?? undefined,
      prefsToken: footer.token,
    }),
    unsubscribeUrl: footer.oneClickUnsubscribeUrl,
  });

  revalidatePath("/members");
  return { ok: true };
}

// F9 — objetivos concretos (RB-PERFIL-003) y entrenador responsable (RB-PERFIL-002).
export async function assignClientGoalAction(formData: FormData): Promise<MembersActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const memberId = String(formData.get("memberId") ?? "");
  const label = String(formData.get("label") ?? "");
  const result = await assignClientGoal(session.user.orgId, memberId, label);
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function markClientGoalAchievedAction(goalId: string, memberId: string): Promise<MembersActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const result = await markClientGoalAchieved(session.user.orgId, goalId);
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function addClientGoalTemplateAction(formData: FormData): Promise<MembersActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!canManageOrg(session.user.role) && session.user.role !== "CENTER_DIRECTOR") {
    return { ok: false, error: "No tienes permiso." };
  }
  const result = await addClientGoalTemplate(session.user.orgId, String(formData.get("label") ?? ""));
  if (!result.ok) return result;
  revalidatePath("/members");
  return { ok: true };
}

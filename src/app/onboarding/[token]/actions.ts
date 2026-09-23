"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { MIN_PASSWORD_LENGTH, ensureIdentity, hashPassword } from "@/lib/identity";
import { CONSENT_VERSION } from "@/lib/consent";
import { ensureInitialAssessment } from "@/lib/member-first-session-queries";

export type OnboardingResult = { ok: true } | { ok: false; error: string };

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

/**
 * La invitación se consume DENTRO de la transacción que fija la contraseña y
 * solo si seguía sin usar: dos envíos a la vez (doble clic, dos pestañas) ya
 * no pueden canjearla los dos, y si algo falla a mitad no queda una
 * contraseña fijada con el enlace todavía vivo, ni al revés.
 */
class InvitationAlreadyUsed extends Error {}

async function claimInvitation(tx: Prisma.TransactionClient, invitationId: string, now: Date) {
  const { count } = await tx.invitation.updateMany({
    where: { id: invitationId, usedAt: null },
    data: { usedAt: now },
  });
  if (count === 0) throw new InvitationAlreadyUsed();
}

export async function completeStaffOnboarding(token: string, password?: string): Promise<OnboardingResult> {
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
    select: { identityId: true, identity: { select: { passwordSetAt: true } } },
  });
  if (!membership) return { ok: false, error: invitationInvalidError("notfound")! };

  // RB-ID-003 (QA-ALTA-09): quien ya tenía contraseña en Apta (trabaja en otro
  // centro, o es socio) entra con la suya. Antes se sobrescribía con la que
  // escribiera aquí, y cambiaba su acceso en todas sus organizaciones.
  const mustSetPassword = !membership.identity.passwordSetAt;
  if (mustSetPassword && (!password || password.length < MIN_PASSWORD_LENGTH)) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const now = new Date();
  const passwordHash = mustSetPassword ? await hashPassword(password!) : null;
  try {
    await prisma.$transaction(async (tx) => {
      await claimInvitation(tx, invitation.id, now);
      if (passwordHash) {
        await tx.identity.update({
          where: { id: membership.identityId },
          data: { passwordHash, passwordSetAt: now },
        });
      }
    });
  } catch (error) {
    if (error instanceof InvitationAlreadyUsed) return { ok: false, error: invitationInvalidError("used")! };
    throw error;
  }

  return { ok: true };
}

export async function completeMemberOnboarding(
  token: string,
  input: {
    password?: string;
    /**
     * Opcional solo en el TIPO, para no romper la compilación de quien todavía
     * no lo manda (`e2e/fixtures/booking-members.ts`, fuera de esta pista):
     * en ejecución es obligatorio y sin `true` no se activa la cuenta.
     */
    consentContract?: boolean;
    consentHealth: boolean;
    consentImages: boolean;
    consentMarketing: boolean;
    consentAI: boolean;
    sex?: "FEMALE" | "MALE" | "OTHER" | "";
  }
): Promise<OnboardingResult> {
  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) return { ok: false, error: invitationInvalidError("notfound")! };
  if (invitation.type !== "MEMBER") return { ok: false, error: invitationInvalidError("type")! };
  if (invitation.usedAt) return { ok: false, error: invitationInvalidError("used")! };
  if (invitation.expiresAt < new Date()) return { ok: false, error: invitationInvalidError("expired")! };
  if (!invitation.memberId) return { ok: false, error: invitationInvalidError("notfound")! };

  // QA-ALTA-09: los dos obligatorios los exige el SERVIDOR. Hasta ahora solo
  // los pedía el botón del formulario, y una llamada directa a la acción
  // activaba la cuenta sin consentimiento de salud (art. 9.2.a RGPD) y con
  // el contrato marcado como aceptado sin que nadie lo hubiera marcado.
  if (input.consentHealth !== true) {
    return { ok: false, error: "Necesitamos tu consentimiento de datos de salud para poder entrenarte." };
  }
  if (input.consentContract !== true) {
    return { ok: false, error: "Tienes que aceptar el contrato de servicios para continuar." };
  }

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
  const passwordHash = mustSetPassword ? await hashPassword(input.password!) : null;

  try {
    await prisma.$transaction(async (tx) => {
      await claimInvitation(tx, invitation.id, now);

      const identity = await ensureIdentity(tx, {
        email: member.email,
        ...(passwordHash ? { passwordHash } : {}),
      });
      if (passwordHash) {
        // El hash también se escribe aquí y no solo al crearla: una identidad
        // que ya existía SIN contraseña (invitada como personal y sin activar)
        // se quedaba con la inutilizable y la persona no podía entrar.
        await tx.identity.update({ where: { id: identity.id }, data: { passwordHash, passwordSetAt: now } });
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
          consentHealth: true,
          consentHealthAt: now,
          consentImages: input.consentImages,
          consentImagesAt: input.consentImages ? now : null,
          consentMarketing: input.consentMarketing,
          consentMarketingAt: input.consentMarketing ? now : null,
          // F3 §4.4: la IA es un consentimiento propio y separado. Oponerse no
          // afecta al acceso al servicio — solo a por qué vía entra en F6.
          consentAI: input.consentAI,
          consentAIAt: input.consentAI ? now : null,
          consentVersion: CONSENT_VERSION,
        },
      });
      // Art. 7.1 RGPD: hay que poder demostrar qué se consintió, cuándo y con
      // qué texto — también el «no», que es lo que evita volver a preguntar.
      await tx.auditLog.create({
        data: {
          orgId: member.orgId,
          actorUserId: user.id,
          action: "MEMBER_ONBOARDING_CONSENTS_RECORDED",
          entityType: "Member",
          entityId: member.id,
          memberId: member.id,
          metadata: {
            consentVersion: CONSENT_VERSION,
            contract: true,
            health: true,
            images: input.consentImages === true,
            marketing: input.consentMarketing === true,
            ai: input.consentAI === true,
            passwordSet: mustSetPassword,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof InvitationAlreadyUsed) return { ok: false, error: invitationInvalidError("used")! };
    throw error;
  }

  // F-ALTA: la valoración inicial se abre aquí y no espera al cron diario.
  // El socio entra al portal inmediatamente después de esta llamada y el muro
  // de la primera sesión necesita encontrarla ya abierta; con el cron, quien se
  // diera de alta por la tarde entraría sin valoración que rellenar y el hito
  // se perdería hasta el día siguiente. Fuera de la transacción a propósito:
  // que fallara al crearla no puede deshacer una contraseña ya fijada ni una
  // invitación ya consumida — dejaría al socio sin poder entrar.
  await ensureInitialAssessment(member.orgId, member.id, member.joinedAt);

  return { ok: true };
}

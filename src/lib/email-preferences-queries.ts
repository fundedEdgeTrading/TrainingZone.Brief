import { prisma } from "@/lib/prisma";
import {
  generateEmailPreferencesToken,
  emailPreferencesUrlFor,
  emailUnsubscribeUrlFor,
  emailUnsubscribePostUrlFor,
} from "@/lib/email-verification";
import { MEMBER_EMAIL_PREFERENCES_SELECT, type MemberEmailKind, type MemberEmailPreferences } from "@/lib/email-preferences";

/**
 * Lectura y escritura de las preferencias de correo del socio. Separado de
 * `email-preferences.ts` (que es puro) porque este módulo arrastra Prisma y no
 * puede acabar en el bundle de cliente del formulario de preferencias.
 */

/** Token del pie de un correo concreto. Un token por socio, no por envío. */
export function emailPreferencesTokenFor(memberId: string) {
  return generateEmailPreferencesToken(memberId);
}

/** Los dos enlaces del pie más el token, para el `List-Unsubscribe` del envío. */
export function memberEmailFooterLinks(memberId: string) {
  const token = emailPreferencesTokenFor(memberId);
  return {
    token,
    preferencesUrl: emailPreferencesUrlFor(token),
    unsubscribeUrl: emailUnsubscribeUrlFor(token),
    /** Para la cabecera `List-Unsubscribe` del envío, no para el pie. */
    oneClickUnsubscribeUrl: emailUnsubscribePostUrlFor(token),
  };
}

export type MemberEmailPreferencesView = {
  memberId: string;
  firstName: string;
  email: string;
  brandName: string;
  centerName: string;
  preferences: MemberEmailPreferences;
};

/** Datos que necesita la pantalla de preferencias/baja para un socio. */
export async function getMemberEmailPreferences(memberId: string): Promise<MemberEmailPreferencesView | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      email: true,
      ...MEMBER_EMAIL_PREFERENCES_SELECT,
      organization: { select: { name: true } },
      primaryCenter: { select: { name: true } },
    },
  });
  if (!member) return null;

  return {
    memberId: member.id,
    firstName: member.firstName,
    email: member.email,
    brandName: member.organization.name,
    centerName: member.primaryCenter.name,
    preferences: {
      notifyVacancies: member.notifyVacancies,
      notifyBirthday: member.notifyBirthday,
      notifyAssessments: member.notifyAssessments,
      consentMarketing: member.consentMarketing,
      emailOptOutAt: member.emailOptOutAt,
    },
  };
}

/**
 * Guarda los interruptores. Marcar cualquiera de ellos levanta la baja global:
 * si el socio vuelve a pedir que le avisen de las plazas, la oposición previa
 * a "todo el correo" deja de tener sentido y bloquearía el interruptor que
 * acaba de encender.
 */
export async function updateMemberEmailPreferences(
  memberId: string,
  input: Record<MemberEmailKind, boolean>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, orgId: true } });
  if (!member) return { ok: false, error: "No hemos encontrado tu ficha." };

  const anyEnabled = Object.values(input).some(Boolean);

  await prisma.member.update({
    where: { id: memberId },
    data: {
      notifyVacancies: input.vacancy,
      notifyBirthday: input.birthday,
      notifyAssessments: input.assessment,
      consentMarketing: input.marketing,
      consentMarketingAt: input.marketing ? new Date() : null,
      emailOptOutAt: anyEnabled ? null : new Date(),
    },
  });

  await logPreferenceChange(member.orgId, memberId, "EMAIL_PREFERENCES_UPDATED", input);
  return { ok: true };
}

/**
 * Baja de todo el correo prescindible (enlace "Darme de baja" y cabecera
 * `List-Unsubscribe`). Apaga también los interruptores para que la pantalla de
 * preferencias refleje lo que de verdad va a pasar, en vez de enseñar tres
 * casillas marcadas que no envían nada.
 *
 * Idempotente: darse de baja dos veces no es un error, y no se pisa la fecha
 * de la primera oposición, que es la que vale como prueba.
 */
export async function unsubscribeMemberFromAll(memberId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, orgId: true, emailOptOutAt: true },
  });
  if (!member) return { ok: false, error: "No hemos encontrado tu ficha." };

  await prisma.member.update({
    where: { id: memberId },
    data: {
      notifyVacancies: false,
      notifyBirthday: false,
      notifyAssessments: false,
      consentMarketing: false,
      consentMarketingAt: null,
      emailOptOutAt: member.emailOptOutAt ?? new Date(),
    },
  });

  if (!member.emailOptOutAt) {
    await logPreferenceChange(member.orgId, memberId, "EMAIL_UNSUBSCRIBED", {
      vacancy: false,
      birthday: false,
      assessment: false,
      marketing: false,
    });
  }
  return { ok: true };
}

/**
 * La baja se audita como cualquier otro dato de la ficha: si mañana el socio
 * reclama que se le siguió escribiendo, el registro dice qué pidió y cuándo.
 * Sin `actorUserId`: lo hace el propio socio desde un enlace, sin sesión.
 */
async function logPreferenceChange(
  orgId: string,
  memberId: string,
  action: "EMAIL_PREFERENCES_UPDATED" | "EMAIL_UNSUBSCRIBED",
  prefs: Record<MemberEmailKind, boolean>
) {
  await prisma.auditLog.create({
    data: {
      orgId,
      action,
      entityType: "MemberEmailPreferences",
      entityId: memberId,
      memberId,
      metadata: prefs,
    },
  });
}

import { prisma } from "@/lib/prisma";
import { absoluteUrl, generateInvitationToken, invitationExpiry, onboardingUrlFor } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";

/**
 * QA-ALTA-04 · Bienvenida del socio: invitación vigente + plantilla + envío.
 *
 * Existía repetida en cada alta (manual, importación, reenvío, checkout) y la
 * conversión de un lead no la tenía: el socio nacía con una invitación que
 * nadie le mandaba. Esta es la pieza compartida; quien la llame ya ha resuelto
 * el socio dentro de su organización y su ámbito.
 *
 * Reutiliza la invitación si sigue abierta (la que acaba de crear el alta) y
 * solo emite otra si ya caducó o no existe: así el enlace del correo es
 * siempre el único token válido.
 *
 * Devuelve lo que devuelva `sendMail`, sin reinterpretarlo: el mailer va a
 * cambiar su tipo de retorno y el llamador debe ver el suyo, no una copia.
 */
export async function sendMemberWelcome(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      orgId: true,
      email: true,
      firstName: true,
      lastName: true,
      userId: true,
      primaryCenter: { select: { name: true, address: true } },
      organization: { select: { name: true, logoUrl: true } },
    },
  });
  if (!member) return { ok: false as const, error: "No se ha encontrado ese socio." };
  if (member.userId) return { ok: false as const, error: "Este socio ya completó su acceso." };

  const current = await prisma.invitation.findUnique({
    where: { memberId: member.id },
    select: { token: true, usedAt: true, expiresAt: true },
  });
  const reusable = current && !current.usedAt && current.expiresAt > new Date();
  const token = reusable ? current.token : generateInvitationToken();
  if (!reusable) {
    const expiresAt = invitationExpiry();
    await prisma.invitation.upsert({
      where: { memberId: member.id },
      create: { orgId: member.orgId, type: "MEMBER", token, email: member.email, memberId: member.id, expiresAt },
      update: { token, expiresAt, usedAt: null, email: member.email },
    });
  }

  const orgName = member.organization.name;
  const footer = memberEmailFooterLinks(member.id);
  const mail = await sendMail({
    to: member.email,
    // RB-MARCA-001: el socio no ha comprado la plataforma, ha comprado su gimnasio.
    fromName: orgName,
    subject: `¡Bienvenida a ${orgName}, ${member.firstName}! 🎉 Tu acceso te espera`,
    html: renderMemberWelcomeEmail({
      memberFirstName: member.firstName,
      orgName,
      orgLogoUrl: absoluteUrl(member.organization.logoUrl || "/brand/tz-logo-white.png"),
      centerName: member.primaryCenter.name,
      onboardingUrl: onboardingUrlFor(token),
      memberFullName: `${member.firstName} ${member.lastName}`,
      postalAddress: member.primaryCenter.address ?? undefined,
      prefsToken: footer.token,
    }),
    unsubscribeUrl: footer.oneClickUnsubscribeUrl,
  });
  return { ok: true as const, mail };
}

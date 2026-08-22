"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/invitations";
import { verifyEmailPreferencesToken } from "@/lib/email-verification";
import { type MemberEmailKind } from "@/lib/email-preferences";
import { memberEmailFooterLinks, unsubscribeMemberFromAll, updateMemberEmailPreferences } from "@/lib/email-preferences-queries";
import { renderEmailPreferencesLinkEmail } from "@/lib/emails/templates";

export type PreferencesActionResult = { ok: true } | { ok: false; error: string };

function tokenError(error: "invalid" | "expired") {
  return error === "expired"
    ? "Este enlace ha caducado. Pide uno nuevo desde esta misma página."
    : "Este enlace no es válido.";
}

/** Guarda los interruptores de la pantalla de preferencias. */
export async function saveEmailPreferences(
  token: string,
  values: Record<MemberEmailKind, boolean>
): Promise<PreferencesActionResult> {
  const result = verifyEmailPreferencesToken(token);
  if (!result.ok) return { ok: false, error: tokenError(result.error) };
  return updateMemberEmailPreferences(result.memberId, values);
}

/** Baja de todo el correo prescindible desde el enlace del pie o desde /baja. */
export async function unsubscribeFromAllEmails(token: string): Promise<PreferencesActionResult> {
  const result = verifyEmailPreferencesToken(token);
  if (!result.ok) return { ok: false, error: tokenError(result.error) };
  return unsubscribeMemberFromAll(result.memberId);
}

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Email no válido.") });

/**
 * "Se me ha caducado el enlace del correo": se pide uno nuevo por email.
 *
 * RB-ID-005, igual que `requestPasswordReset`: la respuesta visible es SIEMPRE
 * la misma exista o no el socio. Si no, este formulario público se convierte
 * en un oráculo para averiguar quién es socio de qué gimnasio.
 */
export async function requestEmailPreferencesLink(email: string): Promise<PreferencesActionResult> {
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const member = await prisma.member.findFirst({
    where: { email: parsed.data.email },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      email: true,
      organization: { select: { name: true, logoUrl: true } },
      primaryCenter: { select: { name: true, address: true } },
    },
  });

  if (member) {
    const links = memberEmailFooterLinks(member.id);
    const brandName = member.organization.name;
    try {
      await sendMail({
        to: member.email,
        // RB-MARCA-001: con la marca de su centro, que es de quien recibe los correos.
        fromName: brandName,
        subject: `Tus preferencias de correo — ${brandName}`,
        html: renderEmailPreferencesLinkEmail({
          recipientFirstName: member.firstName,
          brandName,
          brandLogoUrl: absoluteUrl(member.organization.logoUrl || "/brand/tz-logo-white.png"),
          preferencesUrl: links.preferencesUrl,
          centerName: member.primaryCenter.name,
          postalAddress: member.primaryCenter.address ?? undefined,
          prefsToken: links.token,
        }),
        unsubscribeUrl: links.oneClickUnsubscribeUrl,
      });
    } catch (error) {
      // Best-effort (RB-SMTP-001): un fallo del proveedor no debe revelar al
      // visitante si ese email es de un socio o no.
      console.error("[preferencias] error enviando el enlace de preferencias:", error);
    }
  }

  return { ok: true };
}

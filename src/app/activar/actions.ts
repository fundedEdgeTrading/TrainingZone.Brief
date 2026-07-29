"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { createPlatformCheckoutSession } from "@/lib/platform-billing";
import { resendOwnerActivation } from "@/lib/provisioning";
import { sendMail } from "@/lib/mailer";
import { renderVerifyEmail } from "@/lib/emails/templates";
import { generateVerifyEmailToken, verifyEmailUrlFor } from "@/lib/email-verification";
import { absoluteUrl } from "@/lib/invitations";

export type CheckoutActionResult = { ok: true; url: string } | { ok: false; error: string };

/** Solo OWNER puede iniciar el cobro de plataforma de su propia organización. */
export async function createPlatformCheckoutAction(planCode: string): Promise<CheckoutActionResult> {
  const session = await requireSession();
  if (session.user.role !== "OWNER") return { ok: false, error: "Solo la dirección puede activar el pago." };
  return createPlatformCheckoutSession(session.user.orgId, planCode);
}

export type ResendResult = { ok: true } | { ok: false; error: string };

/** B.2: reenviar la confirmación de email del director (no bloquea nada, es su canal de facturación). */
export async function resendVerificationEmailAction(): Promise<ResendResult> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, identity: { select: { id: true, emailVerifiedAt: true } } },
  });
  if (!user) return { ok: false, error: "Usuario no encontrado." };
  if (user.identity.emailVerifiedAt) return { ok: true };

  const org = await prisma.organization.findUnique({ where: { id: session.user.orgId }, select: { name: true } });
  const token = generateVerifyEmailToken(user.identity.id);

  try {
    await sendMail({
      to: user.email,
      subject: `Confirma tu email — ${org?.name ?? "Apta"}`,
      html: renderVerifyEmail({
        directorFirstName: user.name,
        orgName: org?.name ?? "Apta",
        orgLogoUrl: absoluteUrl("/brand/tz-logo-white.png"),
        verifyUrl: verifyEmailUrlFor(token),
      }),
    });
  } catch {
    return { ok: false, error: "No se pudo enviar el email. Inténtalo de nuevo en unos minutos." };
  }
  return { ok: true };
}

export type ResendActivationResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * RB-ALTA-002: reenvío del enlace de activación tras pagar. Es público a
 * propósito — quien acaba de pagar todavía no tiene contraseña, así que no puede
 * iniciar sesión para pedirlo. Se identifica por la sesión de checkout de
 * Stripe, que solo conoce el comprador.
 */
export async function resendActivationLinkAction(sessionId: string): Promise<ResendActivationResult> {
  if (!sessionId.startsWith("cs_")) return { ok: false, error: "Referencia de pago no válida." };
  try {
    return await resendOwnerActivation(sessionId);
  } catch (error) {
    console.error("[activar] error reenviando la activación:", error);
    return { ok: false, error: "No se pudo enviar el email. Inténtalo de nuevo en unos minutos." };
  }
}

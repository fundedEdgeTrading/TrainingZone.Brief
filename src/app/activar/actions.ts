"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { createPlatformCheckoutSession } from "@/lib/platform-billing";
import { sendMail } from "@/lib/mailer";
import { renderVerifyEmail } from "@/lib/emails/templates";
import { generateVerifyEmailToken, verifyEmailUrlFor } from "@/lib/email-verification";
import { absoluteUrl } from "@/lib/invitations";

export type CheckoutActionResult = { ok: true; url: string } | { ok: false; error: string };

/** A.4: solo OWNER puede iniciar el cobro de plataforma de su propia org. */
export async function createPlatformCheckoutAction(planCode: string): Promise<CheckoutActionResult> {
  const session = await requireSession();
  if (session.user.role !== "OWNER") return { ok: false, error: "Solo la dirección puede activar el pago." };
  return createPlatformCheckoutSession(session.user.orgId, planCode);
}

export type ResendResult = { ok: true } | { ok: false; error: string };

/** B.2: reenviar confirmación de email desde el muro de pago. */
export async function resendVerificationEmailAction(): Promise<ResendResult> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, identity: { select: { id: true, emailVerifiedAt: true } } },
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

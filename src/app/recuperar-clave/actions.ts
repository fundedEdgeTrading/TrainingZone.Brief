"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MIN_PASSWORD_LENGTH, setPassword } from "@/lib/identity";
import { absoluteUrl } from "@/lib/invitations";
import { generatePasswordResetToken, passwordResetUrlFor, verifyPasswordResetToken } from "@/lib/email-verification";
import { sendMail } from "@/lib/mailer";
import { renderPasswordResetEmail } from "@/lib/emails/templates";

export type RequestResetResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Email no válido.") });

/**
 * RB-ID-005: la respuesta es SIEMPRE la misma exista o no el email. Devolver
 * "no hay cuenta con ese email" convertiría este formulario, que es público, en
 * un listador de clientes de Apta.
 */
export async function requestPasswordReset(email: string): Promise<RequestResetResult> {
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const identity = await prisma.identity.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      memberships: {
        select: { name: true, organization: { select: { name: true, logoUrl: true } } },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (identity) {
    const membership = identity.memberships[0];
    const brandName = membership?.organization.name ?? "Apta";
    try {
      await sendMail({
        to: identity.email,
        // La recuperación va con la marca de su organización: es donde entra.
        fromName: brandName,
        subject: `Restablecer tu contraseña — ${brandName}`,
        html: renderPasswordResetEmail({
          recipientFirstName: membership?.name.split(" ")[0] ?? "",
          brandName,
          brandLogoUrl: absoluteUrl(membership?.organization.logoUrl ?? "/brand/tz-logo-white.png"),
          resetUrl: passwordResetUrlFor(generatePasswordResetToken(identity.id)),
        }),
      });
    } catch (error) {
      // Best-effort como el resto del envío (RB-SMTP-001): un fallo de SMTP no
      // debe revelar al visitante que la cuenta existe.
      console.error("[recuperar-clave] error enviando email:", error);
    }
  }

  return { ok: true };
}

export type CompleteResetResult = { ok: true } | { ok: false; error: string };

export async function completePasswordReset(token: string, password: string): Promise<CompleteResetResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const result = verifyPasswordResetToken(token);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "expired"
          ? "Este enlace ha caducado. Pide uno nuevo."
          : "Este enlace no es válido.",
    };
  }

  const identity = await prisma.identity.findUnique({ where: { id: result.identityId }, select: { id: true } });
  if (!identity) return { ok: false, error: "Este enlace no es válido." };

  await setPassword(identity.id, password);
  return { ok: true };
}

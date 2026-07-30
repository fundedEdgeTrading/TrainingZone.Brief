"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicMembershipContext } from "@/lib/public-membership-queries";
import { generateMemberBillingToken, memberBillingUrlFor } from "@/lib/email-verification";
import { sendMail } from "@/lib/mailer";
import { renderMemberBillingLinkEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";

export type RequestMemberBillingLinkResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Email no válido.") });

/**
 * A.1: "¿Ya eres socio?" en la landing pública — pide por email un enlace de
 * un solo uso al Billing Portal de Stripe del socio, sin login.
 *
 * RB-ID-005: la respuesta visible es SIEMPRE la misma exista o no el socio con
 * ese email en este centro (mismo criterio que `requestPasswordReset`,
 * recuperar-clave/actions.ts) — si no, este formulario público se convierte en
 * un oráculo para averiguar quién es socio de qué gimnasio.
 */
export async function requestMemberBillingLink(
  orgSlug: string,
  centerSlug: string,
  formData: FormData
): Promise<RequestMemberBillingLinkResult> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const ctx = await getPublicMembershipContext(orgSlug, centerSlug);
  if (!ctx) return { ok: false, error: "Centro no encontrado." };

  const member = await prisma.member.findFirst({
    where: { orgId: ctx.organization.id, email: parsed.data.email },
    select: { id: true, firstName: true, email: true },
  });

  if (member) {
    try {
      await sendMail({
        to: member.email,
        // RB-MARCA-001: con la marca del centro, no de Apta — es donde el socio entrena.
        fromName: ctx.organization.name,
        subject: `Gestiona tu suscripción — ${ctx.organization.name}`,
        html: renderMemberBillingLinkEmail({
          recipientFirstName: member.firstName,
          brandName: ctx.organization.name,
          brandLogoUrl: absoluteUrl(ctx.organization.logoUrl ?? "/brand/tz-logo-white.png"),
          portalRequestUrl: memberBillingUrlFor(generateMemberBillingToken(member.id)),
        }),
      });
    } catch (error) {
      // Best-effort (RB-SMTP-001): un fallo de SMTP no debe revelar al
      // visitante que la cuenta existe.
      console.error("[hazte-socio] error enviando email de gestión de suscripción:", error);
    }
  }

  return { ok: true };
}

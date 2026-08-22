"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPublicMembershipContext } from "@/lib/public-membership-queries";
import { generateMemberBillingToken, memberBillingUrlFor } from "@/lib/email-verification";
import { sendMail } from "@/lib/mailer";
import { renderMemberBillingLinkEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";

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
    select: {
      id: true,
      firstName: true,
      email: true,
      primaryCenter: { select: { address: true } },
      // La cuota que va a gestionar: la recurrente activa, que es la única que
      // el Billing Portal deja cambiar o cancelar.
      subscriptions: {
        where: { status: "ACTIVE", plan: { type: { in: ["MONTHLY", "ONLINE"] } } },
        orderBy: { startDate: "desc" },
        take: 1,
        // `priceCents` de la suscripción, no del plan: es lo que se le cobra a
        // ESTE socio (el plan pudo cambiar de precio después de la venta).
        select: { priceCents: true, plan: { select: { name: true } } },
      },
    },
  });

  if (member) {
    const subscription = member.subscriptions[0];
    const links = memberEmailFooterLinks(member.id);
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
          planName: subscription?.plan.name,
          amountLabel: subscription
            ? `${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
                subscription.priceCents / 100
              )} / mes`
            : undefined,
          // `nextChargeLabel` se queda sin rellenar a propósito: la fecha del
          // próximo cobro la lleva Stripe, no la BD, y una fecha inventada en
          // un correo de cuota es peor que una fila menos en la ficha.
          postalAddress: member.primaryCenter.address ?? undefined,
          prefsToken: links.token,
        }),
        unsubscribeUrl: links.oneClickUnsubscribeUrl,
      });
    } catch (error) {
      // Best-effort (RB-SMTP-001): un fallo de SMTP no debe revelar al
      // visitante que la cuenta existe.
      console.error("[hazte-socio] error enviando email de gestión de suscripción:", error);
    }
  }

  return { ok: true };
}

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { ensureIdentity } from "@/lib/identity";
import { getPlatformPlan } from "@/lib/platform-plans";
import {
  absoluteUrl,
  generateInvitationToken,
  onboardingUrlFor,
} from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderOwnerActivationEmail } from "@/lib/emails/templates";

/**
 * Alta de la organización a partir de un pago confirmado (RB-ALTA-001). Es el
 * único camino por el que nace una organización operativa: no hay formulario
 * previo, así que un checkout abandonado no deja rastro que purgar.
 *
 * La invitación del director caduca a los 14 días (más holgada que los 7 del
 * personal) porque es su único camino de acceso tras haber pagado.
 */
const OWNER_INVITATION_TTL_DAYS = 14;

export type ProvisionResult =
  | { ok: true; created: boolean; orgId: string }
  | { ok: false; error: string };

function ownerInvitationExpiry() {
  return new Date(Date.now() + OWNER_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueOrgSlug(base: string) {
  const root = slugify(base) || "organizacion";
  let slug = root;
  let n = 1;
  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}

function periodEndFrom(session: Stripe.Checkout.Session, isLifetime: boolean): Date | null {
  // El lifetime no tiene fin de ciclo ni dunning: se queda ACTIVE para siempre.
  if (isLifetime) return null;
  const subscription = session.subscription;
  if (subscription && typeof subscription !== "string") {
    const raw = (subscription as { current_period_end?: number }).current_period_end;
    if (raw) return new Date(raw * 1000);
  }
  return null;
}

export async function provisionOrganizationFromCheckout(
  session: Stripe.Checkout.Session
): Promise<ProvisionResult> {
  // 1. Idempotencia: un reenvío del mismo evento no debe crear nada ni enviar
  //    un segundo email de bienvenida.
  const already = await prisma.organization.findUnique({
    where: { provisioningSessionId: session.id },
    select: { id: true },
  });
  if (already) return { ok: true, created: false, orgId: already.id };

  const planCode = session.metadata?.planCode;
  const plan = getPlatformPlan(planCode);
  if (!plan) return { ok: false, error: `Plan no reconocido en el checkout: ${planCode ?? "(ninguno)"}` };

  const details = session.customer_details;
  const email = details?.email?.trim().toLowerCase();
  if (!email) {
    // Sin email no hay a quién activar. No se inventa nada: queda registrado
    // para que soporte lo resuelva a mano con la sesión de Stripe en la mano.
    return { ok: false, error: `Checkout ${session.id} sin email de comprador.` };
  }

  const billingName = details?.name?.trim() || null;
  const taxId = details?.tax_ids?.[0]?.value ?? null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const isLifetime = plan.interval === "lifetime";

  const platformFields = {
    platformStatus: "ACTIVE" as const,
    platformStatusSince: new Date(),
    platformPlan: plan.code,
    currentPeriodEnd: periodEndFrom(session, isLifetime),
    platformStripeCustomerId: customerId,
    platformStripeSubscriptionId: subscriptionId,
    provisioningSessionId: session.id,
  };

  // 2. RB-ALTA-003: si ese email ya dirige una organización, se le actualiza el
  //    plan en vez de crearle una segunda. Comprar dos veces no debe partir sus
  //    datos en dos instalaciones.
  const existingOwner = await prisma.user.findFirst({
    where: { email, role: "OWNER" },
    select: { orgId: true, identityId: true },
  });
  if (existingOwner) {
    await prisma.organization.update({ where: { id: existingOwner.orgId }, data: platformFields });
    return { ok: true, created: false, orgId: existingOwner.orgId };
  }

  const orgName = billingName || email.split("@")[0];

  // 3. Organización + credencial + membresía OWNER + invitación de activación,
  //    todo o nada.
  const { orgId, token } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug: await uniqueOrgSlug(orgName),
        billingEmail: email,
        billingName,
        taxId,
        ...platformFields,
      },
    });

    // Sin contraseña utilizable: la fija el director al canjear su enlace.
    const identity = await ensureIdentity(tx, { email });
    const owner = await tx.user.create({
      data: {
        identityId: identity.id,
        orgId: org.id,
        centerId: null,
        name: billingName || email,
        email: identity.email,
        role: "OWNER",
      },
    });

    const invitation = await tx.invitation.create({
      data: {
        orgId: org.id,
        type: "OWNER",
        token: generateInvitationToken(),
        email: identity.email,
        userId: owner.id,
        expiresAt: ownerInvitationExpiry(),
      },
    });

    return { orgId: org.id, token: invitation.token };
  });

  // 4. Email de bienvenida best-effort: un fallo de SMTP no revierte un alta ya
  //    pagada. Para eso existe el reenvío desde /activar (RB-ALTA-002).
  try {
    await sendMail({
      to: email,
      subject: `Tu plataforma está lista — ${orgName}`,
      html: renderOwnerActivationEmail({
        orgName,
        planName: plan.name,
        aptaLogoUrl: absoluteUrl("/brand/tz-logo-white.png"),
        activationUrl: onboardingUrlFor(token),
      }),
    });
  } catch (error) {
    console.error("[provisioning] error enviando el email de activación:", error);
  }

  return { ok: true, created: true, orgId };
}

/** Renovación o cambio de plan de una organización que ya existe. */
export async function applyPlanChangeFromCheckout(orgId: string, session: Stripe.Checkout.Session) {
  const plan = getPlatformPlan(session.metadata?.planCode);
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      platformStatus: "ACTIVE",
      platformStatusSince: new Date(),
      ...(plan ? { platformPlan: plan.code } : {}),
      ...(subscriptionId ? { platformStripeSubscriptionId: subscriptionId } : {}),
    },
  });
}

/**
 * Reenvío del enlace de activación (RB-ALTA-002). Devuelve el email de destino
 * (enmascarado lo decide la UI) o `null` si la sesión de checkout no corresponde
 * a ninguna organización todavía.
 */
export async function resendOwnerActivation(
  provisioningSessionId: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const org = await prisma.organization.findUnique({
    where: { provisioningSessionId },
    select: { id: true, name: true, platformPlan: true, billingEmail: true },
  });
  if (!org) return { ok: false, error: "Todavía estamos confirmando tu pago. Prueba de nuevo en unos segundos." };

  const invitation = await prisma.invitation.findFirst({
    where: { orgId: org.id, type: "OWNER", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!invitation) {
    return { ok: false, error: "Esta cuenta ya está activada. Inicia sesión con tu email y contraseña." };
  }

  // Se renueva la caducidad al reenviar: si el primer email se perdió, no tiene
  // sentido que el reloj siga corriendo.
  const refreshed = await prisma.invitation.update({
    where: { id: invitation.id },
    data: { expiresAt: ownerInvitationExpiry() },
  });

  const plan = getPlatformPlan(org.platformPlan);
  await sendMail({
    to: refreshed.email,
    subject: `Tu plataforma está lista — ${org.name}`,
    html: renderOwnerActivationEmail({
      orgName: org.name,
      planName: plan?.name ?? "Apta",
      aptaLogoUrl: absoluteUrl("/brand/tz-logo-white.png"),
      activationUrl: onboardingUrlFor(refreshed.token),
    }),
  });

  return { ok: true, email: refreshed.email };
}

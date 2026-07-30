import crypto from "crypto";
import { Prisma, type Role, type Sex } from "@prisma/client";
import { ensureIdentity } from "@/lib/identity";

type Tx = Prisma.TransactionClient;

export const INVITATION_TTL_DAYS = 7;

export function generateInvitationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function invitationExpiry() {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function appBaseUrl() {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export function onboardingUrlFor(token: string) {
  return `${appBaseUrl()}/onboarding/${token}`;
}

// Los clientes de email no tienen un "origen" desde el que resolver rutas
// relativas (p. ej. "/brand/logo.png"), así que las imágenes de las
// plantillas necesitan siempre una URL absoluta.
export function absoluteUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${appBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Alta pragmática del director (D-3/RB-PLAT-002): a diferencia de
 * `createStaffWithInvitation`, crea el OWNER con una contraseña REAL (ya
 * hasheada por el caller) y SIN invitación — el propio alta hace login
 * automático, no hay baile de onboarding por token.
 */
export async function createOwnerAccount(
  tx: Tx,
  params: { orgId: string; name: string; email: string; passwordHash: string }
) {
  const identity = await ensureIdentity(tx, { email: params.email, passwordHash: params.passwordHash });
  if (!identity.passwordSetAt) {
    await tx.identity.update({ where: { id: identity.id }, data: { passwordSetAt: new Date() } });
  }
  return tx.user.create({
    data: {
      identityId: identity.id,
      orgId: params.orgId,
      centerId: null,
      name: params.name,
      email: identity.email,
      role: "OWNER",
    },
  });
}

export async function createStaffWithInvitation(
  tx: Tx,
  params: { orgId: string; name: string; email: string; role: Role; centerId: string | null }
) {
  // RB-ID-003: si el email ya está en Apta (otra organización, u otra membresía
  // aquí mismo) se reutiliza su credencial en vez de fallar por email duplicado.
  const identity = await ensureIdentity(tx, { email: params.email });
  const user = await tx.user.create({
    data: {
      identityId: identity.id,
      orgId: params.orgId,
      centerId: params.centerId,
      name: params.name,
      email: identity.email,
      role: params.role,
    },
  });
  const invitation = await tx.invitation.create({
    data: {
      orgId: params.orgId,
      type: "STAFF",
      token: generateInvitationToken(),
      email: params.email,
      userId: user.id,
      expiresAt: invitationExpiry(),
    },
  });
  return { user, invitation };
}

// RB-AGENDA-003: un socio puede darse de alta con varios bonos a la vez
// (p.ej. EP en un centro + grupos en otro). Centraliza el cálculo de
// priceCents/sessionsRemaining a partir del plan para no duplicarlo entre el
// alta (aquí, uno por entrada de `bonos`) y el alta "en solitario" de un bono
// posterior (members/[id]/actions.ts::addSubscription, cálculo trivial que no
// justifica compartir módulo).
async function createBonoSubscription(
  tx: Tx,
  params: { orgId: string; memberId: string; planId: string; centerId: string }
) {
  // Defensa en profundidad (RB-AGENDA-003): el formulario ya restringe las
  // opciones a planes/centros de la propia organización, pero no nos fiamos
  // solo del cliente.
  const [plan, center] = await Promise.all([
    tx.membershipPlan.findFirst({ where: { id: params.planId, orgId: params.orgId } }),
    tx.center.findFirst({ where: { id: params.centerId, orgId: params.orgId }, select: { id: true } }),
  ]);
  if (!plan || !center) return null;

  return tx.subscription.create({
    data: {
      memberId: params.memberId,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: plan.priceCents,
      status: "ACTIVE",
      sessionsRemaining: plan.sessionsIncluded ?? null,
    },
  });
}

export async function createMemberWithInvitation(
  tx: Tx,
  params: {
    orgId: string;
    primaryCenterId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    birthDate?: Date | null;
    // Cero o más bonos, cada uno con su propio centro (RB-AGENDA-003): un
    // socio puede darse de alta sin bono todavía, con uno, o con varios de
    // distinta modalidad/centro.
    bonos: { planId: string; centerId: string }[];
    // F9 (RB-PERFIL): perfil extendido heredado del lead de origen (F8), si aplica.
    postalCode?: string | null;
    occupation?: string | null;
    hasChildren?: boolean | null;
    sex?: Sex | null; // BI-2/RB-BI-005: heredado del lead de origen si se respondió
    channel?: string | null;
    originLeadId?: string | null;
  }
) {
  const member = await tx.member.create({
    data: {
      orgId: params.orgId,
      primaryCenterId: params.primaryCenterId,
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      phone: params.phone ?? null,
      birthDate: params.birthDate ?? null,
      state: "TRIAL",
      postalCode: params.postalCode ?? null,
      occupation: params.occupation ?? null,
      hasChildren: params.hasChildren ?? null,
      sex: params.sex ?? null,
      channel: params.channel ?? null,
      originLeadId: params.originLeadId ?? null,
    },
  });

  // Se devuelven en el mismo orden que `params.bonos` (uno puede venir `null`
  // si el plan/centro no existían — defensa en profundidad de
  // `createBonoSubscription`) para que el caller pueda enlazar cada bono con
  // lo que lo originó, p.ej. el checkout público de la landing necesita el id
  // del bono recién creado para engancharle el `stripeSubscriptionId`.
  const subscriptions = [];
  for (const bono of params.bonos) {
    subscriptions.push(
      await createBonoSubscription(tx, {
        orgId: params.orgId,
        memberId: member.id,
        planId: bono.planId,
        centerId: bono.centerId,
      })
    );
  }

  const invitation = await tx.invitation.create({
    data: {
      orgId: params.orgId,
      type: "MEMBER",
      token: generateInvitationToken(),
      email: params.email,
      memberId: member.id,
      expiresAt: invitationExpiry(),
    },
  });
  return { member, invitation, subscriptions };
}

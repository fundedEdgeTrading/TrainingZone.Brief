import { prisma } from "@/lib/prisma";
import type { PlatformStatus } from "@prisma/client";
import { getPlatformPlan, monthlyPriceCents } from "@/lib/platform-plans";

/**
 * E6-08 · back-office `/apta`. Consultas de ámbito PLATAFORMA (todas las
 * organizaciones), no de ámbito organización — por eso viven aparte de
 * `org-queries.ts`. Deliberadamente NO tocan nada de un socio salvo el
 * recuento: ni ficha, ni consentimiento, ni dato de salud. `PLATFORM_ADMIN`
 * es soporte de la plataforma, no del gimnasio.
 */
export type PlatformOrgFilter = {
  query?: string;
  status?: PlatformStatus;
};

export type PlatformOrgRow = {
  id: string;
  name: string;
  slug: string;
  platformStatus: PlatformStatus;
  platformStatusSince: Date;
  planCode: string | null;
  planName: string | null;
  createdAt: Date;
  centersCount: number;
  membersCount: number;
  /**
   * Aproximación: no hay tabla local de facturas de la suscripción de
   * plataforma (Apta → gimnasio) — `Payment` es el cobro del GIMNASIO a SUS
   * socios (Parte B), un dato de negocio distinto que este back-office no
   * debe mezclar con el cobro de licencia. Se usa `platformStatusSince` de
   * una organización ACTIVE/PAST_DUE como proxy del último ciclo de cobro
   * conocido; el importe exacto y el histórico completo viven en Stripe.
   */
  lastPlatformChargeAt: Date | null;
  /** Hay una invitación OWNER sin canjear: se puede reenviar la activación. */
  canResendActivation: boolean;
  billingEmail: string | null;
};

export async function listOrganizationsForAdmin(filter: PlatformOrgFilter = {}): Promise<PlatformOrgRow[]> {
  const orgs = await prisma.organization.findMany({
    where: {
      ...(filter.status ? { platformStatus: filter.status } : {}),
      ...(filter.query
        ? {
            OR: [
              { name: { contains: filter.query, mode: "insensitive" } },
              { billingEmail: { contains: filter.query, mode: "insensitive" } },
              { slug: { contains: filter.query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      platformStatus: true,
      platformStatusSince: true,
      platformPlan: true,
      createdAt: true,
      billingEmail: true,
      _count: { select: { centers: true, members: true } },
      invitations: {
        where: { type: "OWNER", usedAt: null },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orgs.map((org) => {
    const plan = getPlatformPlan(org.platformPlan);
    const isBillable = org.platformStatus === "ACTIVE" || org.platformStatus === "PAST_DUE";
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      platformStatus: org.platformStatus,
      platformStatusSince: org.platformStatusSince,
      planCode: org.platformPlan,
      planName: plan?.name ?? null,
      createdAt: org.createdAt,
      centersCount: org._count.centers,
      membersCount: org._count.members,
      lastPlatformChargeAt: isBillable ? org.platformStatusSince : null,
      canResendActivation: org.invitations.length > 0,
      billingEmail: org.billingEmail,
    };
  });
}

export type PlatformMetrics = {
  active: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  pendingPayment: number;
  /** MRR de las organizaciones ACTIVE + PAST_DUE (siguen facturando; TRIALING y Fundador no aportan). */
  mrrCents: number;
};

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const [statusCounts, billableOrgs] = await Promise.all([
    prisma.organization.groupBy({ by: ["platformStatus"], _count: { _all: true } }),
    prisma.organization.findMany({
      where: { platformStatus: { in: ["ACTIVE", "PAST_DUE"] } },
      select: { platformPlan: true },
    }),
  ]);

  const countOf = (status: PlatformStatus) => statusCounts.find((s) => s.platformStatus === status)?._count._all ?? 0;

  const mrrCents = billableOrgs.reduce((sum, org) => {
    const plan = getPlatformPlan(org.platformPlan);
    return sum + (plan ? monthlyPriceCents(plan) ?? 0 : 0);
  }, 0);

  return {
    active: countOf("ACTIVE"),
    pastDue: countOf("PAST_DUE"),
    suspended: countOf("SUSPENDED"),
    cancelled: countOf("CANCELLED"),
    pendingPayment: countOf("PENDING_PAYMENT"),
    mrrCents,
  };
}

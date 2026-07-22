import { prisma } from "@/lib/prisma";
import type { PaymentStatus } from "@prisma/client";

export async function listPayments(orgId: string, opts: { status?: PaymentStatus } = {}) {
  return prisma.payment.findMany({
    where: { orgId, status: opts.status || undefined },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { date: "desc" },
    take: 100,
  });
}

export async function getBillingKpis(orgId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [paidThisMonth, pending, failed, delinquentMembers] = await Promise.all([
    prisma.payment.aggregate({
      where: { orgId, status: "PAID", date: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    // RB-PAGO-002 (B.3.3): un pago aplazado con dueDate futura no cuenta como
    // pendiente "preocupante" — solo los que ya no tienen plazo o están vencidos.
    prisma.payment.count({ where: { orgId, status: "PENDING", OR: [{ dueDate: null }, { dueDate: { lte: now } }] } }),
    prisma.payment.count({ where: { orgId, status: "FAILED" } }),
    prisma.member.count({ where: { orgId, state: "DELINQUENT" } }),
  ]);

  return {
    paidThisMonthCents: paidThisMonth._sum.amountCents ?? 0,
    pending,
    failed,
    delinquentMembers,
  };
}

export async function getDelinquentMembers(orgId: string) {
  return prisma.member.findMany({
    where: { orgId, state: "DELINQUENT" },
    include: {
      primaryCenter: true,
      // RB-PAGO-002: el último pago mostrado no debe ser un aplazamiento con
      // dueDate futura — eso no es la causa de la morosidad, sino el pago vencido/fallido anterior.
      payments: { where: { OR: [{ dueDate: null }, { dueDate: { lte: new Date() } }] }, orderBy: { date: "desc" }, take: 1 },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
    },
    orderBy: { lastName: "asc" },
  });
}

/** PAGO-1: suscripción activa/congelada de un socio, con su información de pausa/cancelación programada. */
export async function getSubscriptionWithPauseInfo(orgId: string, memberId: string) {
  return prisma.subscription.findFirst({
    where: { member: { id: memberId, orgId }, status: { in: ["ACTIVE", "FROZEN"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMembersForPaymentForm(orgId: string) {
  return prisma.member.findMany({
    where: { orgId, state: { in: ["ACTIVE", "DELINQUENT", "TRIAL"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        select: { id: true, priceCents: true, plan: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { lastName: "asc" },
  });
}

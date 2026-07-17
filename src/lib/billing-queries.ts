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
    prisma.payment.count({ where: { orgId, status: "PENDING" } }),
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
      payments: { orderBy: { date: "desc" }, take: 1 },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
    },
    orderBy: { lastName: "asc" },
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

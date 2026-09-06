import { prisma } from "@/lib/prisma";
import type { PaymentStatus } from "@prisma/client";

/**
 * Ámbito de centro (`center-scope.ts`): igual que `members/page.tsx`,
 * `centerIds === undefined` es "sin filtro" (dirección de organización) y
 * `centerIds` presente —aunque venga vacío— manda siempre. Antes Cobros
 * filtraba solo por `orgId`: recepción/dirección de un centro veía y podía
 * cobrar/congelar/cancelar la cuota de socios de otros centros de la misma
 * organización.
 */
export type PaymentSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const PAYMENT_ORDER_BY: Record<PaymentSort, { date?: "asc" | "desc"; amountCents?: "asc" | "desc" }> = {
  date_desc: { date: "desc" },
  date_asc: { date: "asc" },
  amount_desc: { amountCents: "desc" },
  amount_asc: { amountCents: "asc" },
};

function paymentsWhere(orgId: string, opts: { status?: PaymentStatus; statuses?: PaymentStatus[]; centerIds?: string[] }) {
  return {
    orgId,
    // `statuses`: eje multi-valor de la píldora de estado (dentro del eje, OR).
    ...(opts.statuses?.length ? { status: { in: opts.statuses } } : { status: opts.status || undefined }),
    ...(opts.centerIds !== undefined ? { member: { primaryCenterId: { in: opts.centerIds } } } : {}),
  };
}

/**
 * E8-13: paginación y orden en servidor, con el estado en la URL
 * (`/billing?page=&sort=`) — antes `take: 100` era un tope silencioso sin
 * ningún control de orden, y la única forma de "ordenar" era client-side
 * sobre esas 100 filas ya recortadas.
 */
export async function listPayments(
  orgId: string,
  opts: {
    status?: PaymentStatus;
    statuses?: PaymentStatus[];
    centerIds?: string[];
    sort?: PaymentSort;
    skip?: number;
    take?: number;
  } = {}
) {
  return prisma.payment.findMany({
    where: paymentsWhere(orgId, opts),
    include: { member: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    orderBy: PAYMENT_ORDER_BY[opts.sort ?? "date_desc"],
    skip: opts.skip,
    take: opts.take,
  });
}

export async function countPayments(
  orgId: string,
  opts: { status?: PaymentStatus; statuses?: PaymentStatus[]; centerIds?: string[] } = {}
) {
  return prisma.payment.count({ where: paymentsWhere(orgId, opts) });
}

export async function getBillingKpis(orgId: string, centerIds?: string[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const memberCenterFilter = centerIds !== undefined ? { member: { primaryCenterId: { in: centerIds } } } : {};

  const [paidThisMonth, pending, failed, delinquentMembers] = await Promise.all([
    prisma.payment.aggregate({
      where: { orgId, status: "PAID", date: { gte: monthStart }, ...memberCenterFilter },
      _sum: { amountCents: true },
    }),
    // RB-PAGO-002 (B.3.3): un pago aplazado con dueDate futura no cuenta como
    // pendiente "preocupante" — solo los que ya no tienen plazo o están vencidos.
    prisma.payment.count({
      where: { orgId, status: "PENDING", OR: [{ dueDate: null }, { dueDate: { lte: now } }], ...memberCenterFilter },
    }),
    prisma.payment.count({ where: { orgId, status: "FAILED", ...memberCenterFilter } }),
    prisma.member.count({
      where: { orgId, state: "DELINQUENT", ...(centerIds !== undefined ? { primaryCenterId: { in: centerIds } } : {}) },
    }),
  ]);

  return {
    paidThisMonthCents: paidThisMonth._sum.amountCents ?? 0,
    pending,
    failed,
    delinquentMembers,
  };
}

export async function getDelinquentMembers(orgId: string, centerIds?: string[]) {
  return prisma.member.findMany({
    where: { orgId, state: "DELINQUENT", ...(centerIds !== undefined ? { primaryCenterId: { in: centerIds } } : {}) },
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

export async function getMembersForPaymentForm(orgId: string, centerIds?: string[]) {
  return prisma.member.findMany({
    where: {
      orgId,
      state: { in: ["ACTIVE", "DELINQUENT", "TRIAL"] },
      ...(centerIds !== undefined ? { primaryCenterId: { in: centerIds } } : {}),
    },
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

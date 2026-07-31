import { prisma } from "@/lib/prisma";

export type SalesRankingRow = {
  userId: string;
  name: string;
  role: string;
  salesCount: number;
  totalCents: number;
};

/**
 * RB-RRHH-004: ranking de ventas por trabajador y mes. El dato
 * (`Payment.soldByUserId`) ya se captura en cada cobro — manual, checkout de
 * staff o autoservicio del socio (member-billing.ts) —; esta es la vista que
 * lo agrega, que hasta ahora no existía.
 */
export async function getSalesRanking(orgId: string, range: { from: Date; to: Date }): Promise<SalesRankingRow[]> {
  const payments = await prisma.payment.findMany({
    where: { orgId, status: "PAID", soldByUserId: { not: null }, date: { gte: range.from, lte: range.to } },
    select: { amountCents: true, soldByUserId: true, soldBy: { select: { name: true, role: true } } },
  });

  const byUser = new Map<string, SalesRankingRow>();
  for (const p of payments) {
    if (!p.soldByUserId || !p.soldBy) continue;
    const row = byUser.get(p.soldByUserId) ?? { userId: p.soldByUserId, name: p.soldBy.name, role: p.soldBy.role, salesCount: 0, totalCents: 0 };
    row.salesCount += 1;
    row.totalCents += p.amountCents;
    byUser.set(p.soldByUserId, row);
  }

  return [...byUser.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** Mes natural en curso (calendario del servidor: suficiente para un ranking mensual, no una hora exacta). */
export function currentMonthRange(reference: Date = new Date()): { from: Date; to: Date; label: string } {
  const from = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const to = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999);
  const label = reference.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return { from, to, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

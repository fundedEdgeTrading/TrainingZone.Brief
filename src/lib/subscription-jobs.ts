import { prisma } from "@/lib/prisma";

/**
 * RB-PAGO-006: ejecuta las cancelaciones de suscripción programadas cuya fecha
 * ya se ha cumplido. Sin worker en este stack, se invoca desde /api/jobs/run
 * (mismo patrón que el resto de reglas temporales del CRM).
 */
export async function runScheduledCancellationsRule(orgId: string): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { member: { orgId }, status: { in: ["ACTIVE", "FROZEN"] }, cancelAt: { lte: new Date() } },
    select: { id: true, memberId: true },
  });
  if (!due.length) return 0;

  for (const s of due) {
    await prisma.$transaction([
      prisma.subscription.update({ where: { id: s.id }, data: { status: "CANCELLED", cancelAt: null } }),
      prisma.member.update({ where: { id: s.memberId }, data: { state: "CANCELLED", cancelledAt: new Date() } }),
    ]);
  }
  return due.length;
}

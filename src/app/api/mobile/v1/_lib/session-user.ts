import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MemberSummary = {
  id: string;
  firstName: string;
  centerName: string;
  /** Gate de compra del handoff (A2): sin bono vivo, el socio va al catálogo. */
  hasActiveMembership: boolean;
};

/**
 * Resumen de la ficha de socio que acompaña a la sesión (`/me` y `/auth/login`),
 * para que la app resuelva el gate de compra sin una petición extra al arrancar.
 * Devuelve null para el personal del centro.
 */
export async function memberSummaryFor(userId: string, orgId: string, role: Role): Promise<MemberSummary | null> {
  if (role !== "MEMBER") return null;

  const member = await prisma.member.findFirst({
    where: { userId, orgId },
    select: {
      id: true,
      firstName: true,
      primaryCenter: { select: { name: true } },
      subscriptions: { where: { status: { in: ["ACTIVE", "FROZEN"] } }, select: { id: true }, take: 1 },
    },
  });
  if (!member) return null;

  return {
    id: member.id,
    firstName: member.firstName,
    centerName: member.primaryCenter.name,
    hasActiveMembership: member.subscriptions.length > 0,
  };
}

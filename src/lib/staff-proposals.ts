import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

export type StaffProposalResult = { ok: true } | { ok: false; error: string };

// RB-RRHH-003: buzón de propuestas → notifica a dirección.
export async function submitStaffProposal(orgId: string, authorUserId: string, body: string): Promise<StaffProposalResult> {
  if (!body.trim()) return { ok: false, error: "Escribe tu propuesta." };
  const proposal = await prisma.staffProposal.create({ data: { orgId, authorUserId, body: body.trim() } });

  const author = await prisma.user.findUnique({ where: { id: authorUserId }, select: { name: true } });
  const directors = await prisma.user.findMany({ where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] } }, select: { id: true } });
  for (const d of directors) {
    await createNotificationOnce({
      orgId,
      recipientUserId: d.id,
      kind: "INFO",
      title: `Nueva propuesta de ${author?.name ?? "un compañero"}`,
      body: proposal.body,
      entityType: "StaffProposal",
      entityId: proposal.id,
    });
  }
  return { ok: true };
}

export async function listStaffProposals(orgId: string) {
  return prisma.staffProposal.findMany({
    where: { orgId },
    include: { author: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function markProposalReviewed(orgId: string, proposalId: string): Promise<StaffProposalResult> {
  const proposal = await prisma.staffProposal.findFirst({ where: { id: proposalId, orgId }, select: { id: true } });
  if (!proposal) return { ok: false, error: "Propuesta no encontrada." };
  await prisma.staffProposal.update({ where: { id: proposalId }, data: { status: "REVIEWED" } });
  return { ok: true };
}

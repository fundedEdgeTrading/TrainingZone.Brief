import { prisma } from "@/lib/prisma";
import type { OfferStatus } from "@prisma/client";
import { createNotificationOnce } from "@/lib/notifications";

export async function listOffers(orgId: string, opts: { trainerUserId?: string } = {}) {
  return prisma.personalizedOffer.findMany({
    where: {
      orgId,
      member: opts.trainerUserId ? { trainerId: opts.trainerUserId } : undefined,
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      proposedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type OfferWriteResult = { ok: true } | { ok: false; error: string };

/** RB-RRHH-008: motor sugiere (SUGERIDA) — señal simple: ~1 sesión/semana durante 8+ semanas de antigüedad. */
export async function generateOfferSuggestions(orgId: string): Promise<number> {
  const since8Weeks = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.member.findMany({
    where: { orgId, state: "ACTIVE", joinedAt: { lte: since8Weeks } },
    select: { id: true, firstName: true, lastName: true, trainerId: true, joinedAt: true },
  });

  let created = 0;
  for (const member of candidates) {
    const existingOpen = await prisma.personalizedOffer.findFirst({
      where: { orgId, memberId: member.id, status: { in: ["SUGERIDA", "PENDIENTE_DIRECCION", "APROBADA"] } },
      select: { id: true },
    });
    if (existingOpen) continue;

    const attended = await prisma.booking.count({
      where: { memberId: member.id, status: "ATTENDED", session: { date: { gte: since8Weeks } } },
    });
    const perWeek = attended / 8;
    if (perWeek < 0.7 || perWeek > 1.3) continue;

    await prisma.personalizedOffer.create({
      data: {
        orgId,
        memberId: member.id,
        signals: { attendancePerWeek: Number(perWeek.toFixed(2)), tenureDays: Math.round((Date.now() - member.joinedAt.getTime()) / 86400000) },
        description: `${member.firstName} lleva semanas viniendo ~1 día/semana — ofrecer 2 días/semana con 20% dto. el primer mes.`,
        status: "SUGERIDA",
      },
    });
    if (member.trainerId) {
      await createNotificationOnce({
        orgId,
        recipientUserId: member.trainerId,
        kind: "TASK",
        title: `Oferta sugerida para ${member.firstName} ${member.lastName}`,
        body: "El motor de ofertas detectó una oportunidad de upsell. Revísala en Ofertas.",
        entityType: "PersonalizedOffer",
        entityId: member.id,
      });
    }
    created++;
  }
  return created;
}

export async function createManualOffer(orgId: string, memberId: string, proposedByUserId: string, description: string): Promise<OfferWriteResult> {
  if (!description.trim()) return { ok: false, error: "Describe la oferta." };
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  await prisma.personalizedOffer.create({
    data: { orgId, memberId, proposedByUserId, description: description.trim(), signals: { manual: true }, status: "PENDIENTE_DIRECCION" },
  });
  return { ok: true };
}

/** RB-RRHH-013: el entrenador eleva una sugerencia del motor a dirección. */
export async function elevateOffer(orgId: string, offerId: string, proposedByUserId: string): Promise<OfferWriteResult> {
  const offer = await prisma.personalizedOffer.findFirst({ where: { id: offerId, orgId }, select: { id: true, status: true } });
  if (!offer) return { ok: false, error: "Oferta no encontrada." };
  if (offer.status !== "SUGERIDA") return { ok: false, error: "Solo se puede elevar una oferta sugerida." };
  await prisma.personalizedOffer.update({ where: { id: offerId }, data: { status: "PENDIENTE_DIRECCION", proposedByUserId } });
  return { ok: true };
}

async function setOfferStatus(orgId: string, offerId: string, status: OfferStatus, approvedByUserId?: string): Promise<OfferWriteResult> {
  const offer = await prisma.personalizedOffer.findFirst({ where: { id: offerId, orgId }, select: { id: true } });
  if (!offer) return { ok: false, error: "Oferta no encontrada." };
  await prisma.personalizedOffer.update({ where: { id: offerId }, data: { status, approvedByUserId } });
  return { ok: true };
}

/** RB-RRHH-013: luz verde obligatoria de dirección antes de comunicarse al cliente. */
export async function decideOffer(orgId: string, offerId: string, approvedByUserId: string, approve: boolean): Promise<OfferWriteResult> {
  return setOfferStatus(orgId, offerId, approve ? "APROBADA" : "RECHAZADA", approvedByUserId);
}

export async function markOfferCommunicated(orgId: string, offerId: string): Promise<OfferWriteResult> {
  const offer = await prisma.personalizedOffer.findFirst({ where: { id: offerId, orgId }, select: { id: true, status: true } });
  if (!offer) return { ok: false, error: "Oferta no encontrada." };
  if (offer.status !== "APROBADA") return { ok: false, error: "Solo se puede comunicar una oferta aprobada." };
  await prisma.personalizedOffer.update({ where: { id: offerId }, data: { status: "COMUNICADA" } });
  return { ok: true };
}

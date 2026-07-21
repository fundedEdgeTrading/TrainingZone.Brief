import { prisma } from "@/lib/prisma";
import { canViewHealthData } from "@/lib/rbac";
import type { Role, AptitudeLight } from "@prisma/client";

const LIGHT_RANK: Record<AptitudeLight, number> = { RED: 2, AMBER: 1, GREEN: 0 };

export async function getSessionBrief({
  orgId,
  sessionId,
  actorUserId,
  actorRole,
}: {
  orgId: string;
  sessionId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const session = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, state: true, joinedAt: true } },
          debrief: true,
        },
        orderBy: { member: { lastName: "asc" } },
      },
    },
  });
  if (!session) return null;

  const canSeeHealth = canViewHealthData(actorRole);
  const memberIds = session.bookings.map((b) => b.memberId);

  const healthByMember = new Map<string, { zone: string | null; description: string; type: string }[]>();
  let aptitudeRules: { injuryZone: string; blockArea: string; light: AptitudeLight; adaptation: string | null }[] = [];

  if (canSeeHealth && memberIds.length) {
    const records = await prisma.healthRecord.findMany({
      where: { memberId: { in: memberIds }, status: "ACTIVE" },
      select: { memberId: true, zone: true, description: true, type: true },
    });
    for (const r of records) {
      if (!r.memberId) continue;
      const list = healthByMember.get(r.memberId) ?? [];
      list.push({ zone: r.zone, description: r.description, type: r.type });
      healthByMember.set(r.memberId, list);
    }
    aptitudeRules = await prisma.aptitudeRule.findMany({ where: { orgId } });

    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        action: "SESSION_BRIEF_OPENED",
        entityType: "ClassSession",
        entityId: sessionId,
        metadata: { memberIds },
      },
    });
  }

  const roster = session.bookings.map((b) => {
    const conditions = healthByMember.get(b.memberId) ?? [];
    const matchedRules = conditions.flatMap((c) =>
      c.zone ? aptitudeRules.filter((r) => r.injuryZone === c.zone) : []
    );
    const worstLight = matchedRules.reduce<AptitudeLight | null>((worst, r) => {
      if (!worst || LIGHT_RANK[r.light] > LIGHT_RANK[worst]) return r.light;
      return worst;
    }, null);

    const isNew = Date.now() - b.member.joinedAt.getTime() < 21 * 24 * 60 * 60 * 1000;

    return {
      bookingId: b.id,
      member: b.member,
      isNew,
      conditions,
      matchedRules,
      light: worstLight, // null = sin restricciones conocidas
      debrief: b.debrief,
    };
  });

  return {
    session,
    canSeeHealth,
    roster,
  };
}

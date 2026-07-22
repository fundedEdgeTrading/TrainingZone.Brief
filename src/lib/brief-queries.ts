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

// ---------- FB-1: reporte semanal de Debriefs para dirección (RB-FB-101/103/104) ----------

export type WeeklyDebriefReport = {
  trainerId: string;
  trainerName: string;
  sessions: {
    sessionId: string;
    sessionDate: Date;
    sessionName: string;
    greenCount: number;
    yellowCount: number;
    redCount: number;
    notes: string[];
  }[];
}[];

/** Agrega los SessionDebrief de la semana [weekStart, weekStart+7d) por entrenador y sesión. */
export async function getWeeklyDebriefReport(orgId: string, weekStart: Date): Promise<WeeklyDebriefReport> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const debriefs = await prisma.sessionDebrief.findMany({
    where: { booking: { session: { orgId, date: { gte: weekStart, lt: weekEnd } } } },
    include: {
      booking: {
        select: {
          session: { select: { id: true, date: true, name: true, trainerId: true, trainer: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const byTrainer = new Map<string, WeeklyDebriefReport[number] & { sessionIndex: Map<string, WeeklyDebriefReport[number]["sessions"][number]> }>();

  for (const d of debriefs) {
    const { session: cls } = d.booking;
    const trainerId = cls.trainerId ?? "sin-entrenador";
    const trainerName = cls.trainer?.name ?? "Sin entrenador";

    let trainerEntry = byTrainer.get(trainerId);
    if (!trainerEntry) {
      trainerEntry = { trainerId, trainerName, sessions: [], sessionIndex: new Map() };
      byTrainer.set(trainerId, trainerEntry);
    }

    let sessionEntry = trainerEntry.sessionIndex.get(cls.id);
    if (!sessionEntry) {
      sessionEntry = { sessionId: cls.id, sessionDate: cls.date, sessionName: cls.name, greenCount: 0, yellowCount: 0, redCount: 0, notes: [] };
      trainerEntry.sessionIndex.set(cls.id, sessionEntry);
      trainerEntry.sessions.push(sessionEntry);
    }

    if (d.feeling === "GREEN") sessionEntry.greenCount++;
    else if (d.feeling === "AMBER") sessionEntry.yellowCount++;
    else if (d.feeling === "RED") sessionEntry.redCount++;
    if (d.note?.trim()) sessionEntry.notes.push(d.note.trim());
  }

  return [...byTrainer.values()]
    .map(({ trainerId, trainerName, sessions }) => ({
      trainerId,
      trainerName,
      sessions: sessions.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime()),
    }))
    .sort((a, b) => a.trainerName.localeCompare(b.trainerName));
}

// ---------- FB-2: feedback de sesión del cliente, para contrastar con el Debrief del entrenador ----------

export type ClientFeedbackBySession = Map<string, { feeling: string; rpe: number | null; comment: string | null }[]>;

/**
 * RB-FB-102: SelfAssessment kind="post-sesion" de la semana, indexado por sessionId
 * (vía el bookingId guardado en `structured`) para mostrarlo junto al SessionDebrief
 * de la misma sesión — nunca junto al canal confidencial de TrainerRating.
 */
export async function getWeeklyClientFeedback(orgId: string, weekStart: Date): Promise<ClientFeedbackBySession> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const assessments = await prisma.selfAssessment.findMany({
    where: { orgId, kind: "post-sesion", createdAt: { gte: weekStart, lt: weekEnd } },
    select: { text: true, structured: true },
  });
  if (assessments.length === 0) return new Map();

  const bookingIds = assessments
    .map((a) => (a.structured as { bookingId?: string } | null)?.bookingId)
    .filter((id): id is string => !!id);
  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds } },
    select: { id: true, sessionId: true },
  });
  const sessionIdByBooking = new Map(bookings.map((b) => [b.id, b.sessionId]));

  const bySession: ClientFeedbackBySession = new Map();
  for (const a of assessments) {
    const structured = a.structured as { bookingId?: string; feeling?: string; rpe?: number | null } | null;
    const sessionId = structured?.bookingId ? sessionIdByBooking.get(structured.bookingId) : undefined;
    if (!sessionId || !structured?.feeling) continue;
    const list = bySession.get(sessionId) ?? [];
    list.push({ feeling: structured.feeling, rpe: structured.rpe ?? null, comment: a.text });
    bySession.set(sessionId, list);
  }
  return bySession;
}

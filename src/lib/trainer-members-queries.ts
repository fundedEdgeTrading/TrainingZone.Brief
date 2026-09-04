import type { AptitudeLight, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canViewHealthData } from "@/lib/rbac";
import { OPEN_HEALTH_STATUSES } from "@/lib/health-status";
import { formatDateParam } from "@/lib/date-utils";
import { sessionServiceKind, planServiceKind, bonoUsage, effectiveSessionsIncluded } from "@/lib/session-balance";

/**
 * «Socios» del entrenador (rediseño de la app móvil).
 *
 * En la web el listado de socios es de GESTIÓN (`canManageMembers`: dirección y
 * recepción) y enseña estado comercial, cobros y bajas. El entrenador necesita
 * otra cosa —a quién entrena, cómo va de adherencia y a quién hay que
 * adaptarle la sesión— así que esta consulta no reutiliza `listMembers`: el
 * ámbito no es el centro, es SU gente. Un socio entra en la lista porque el
 * entrenador le ha dado o le va a dar una sesión, no porque comparta centro.
 *
 * Consecuencia deliberada: aquí no hay estado de cobro ni datos de facturación.
 * Si el entrenador necesita eso, la respuesta es la web, no ampliar esta vista.
 */

/** Ventana de adherencia, la misma que usa el panel del entrenador. */
const ADHERENCE_PERIOD_DAYS = 90;
/** Cuánto atrás se mira para decidir que alguien "es" cliente del entrenador. */
const RELATION_PERIOD_DAYS = 120;

export type TrainerMemberFilter = "all" | "ep" | "group" | "alerts";

export type TrainerMemberRow = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  /** Modalidades en las que este entrenador le ha dado sesión. */
  kinds: ("EP" | "GROUP")[];
  adherencePct: number;
  attendedCount: number;
  planNames: string;
  nextLabel: string | null;
  light: "GREEN" | "AMBER" | "RED" | null;
  zone: string | null;
  condition: string | null;
  adaptation: string | null;
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const LIGHT_RANK: Record<AptitudeLight, number> = { RED: 2, AMBER: 1, GREEN: 0 };

type Aptitude = { light: AptitudeLight; zone: string | null; description: string; adaptation: string | null };

/**
 * Semáforo de aptitud de un grupo de socios. Lectura única y AUDITADA, igual
 * que en el panel: cada vez que un entrenador ve condiciones de salud queda
 * registrado quién y sobre quiénes (RGPD/ADR-008).
 */
export async function aptitudeForMembers(
  orgId: string,
  memberIds: string[],
  actor: { userId: string; role: Role },
  auditAction: string
): Promise<Map<string, Aptitude>> {
  const byMember = new Map<string, Aptitude>();
  if (!canViewHealthData(actor.role) || memberIds.length === 0) return byMember;

  const [records, rules] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { memberId: { in: memberIds }, status: { in: OPEN_HEALTH_STATUSES } },
      select: { memberId: true, zone: true, description: true },
    }),
    prisma.aptitudeRule.findMany({ where: { orgId } }),
  ]);

  for (const record of records) {
    if (!record.memberId || !record.zone) continue;
    const rule = rules
      .filter((r) => r.injuryZone === record.zone)
      .sort((a, b) => LIGHT_RANK[b.light] - LIGHT_RANK[a.light])[0];
    if (!rule) continue;
    const current = byMember.get(record.memberId);
    if (!current || LIGHT_RANK[rule.light] > LIGHT_RANK[current.light]) {
      byMember.set(record.memberId, {
        light: rule.light,
        zone: record.zone,
        description: record.description,
        adaptation: rule.adaptation,
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: actor.userId,
      action: auditAction,
      entityType: "Member",
      entityId: actor.userId,
      metadata: { memberIds },
    },
  });

  return byMember;
}

function formatNextLabel(date: Date, startTime: string, today: Date): string {
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return `Hoy ${startTime}`;
  if (days === 1) return `Mañana ${startTime}`;
  if (days > 1 && days < 7) {
    const weekday = date.toLocaleDateString("es-ES", { weekday: "short" });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)} ${startTime}`;
  }
  return `${date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${startTime}`;
}

export async function listTrainerMembers(
  orgId: string,
  actor: { userId: string; role: Role },
  opts: { search?: string; filter?: TrainerMemberFilter } = {}
): Promise<TrainerMemberRow[]> {
  const since = daysAgo(RELATION_PERIOD_DAYS);
  const today = startOfToday();

  // Quién es "suyo": todo el que ha pasado (o va a pasar) por una sesión que
  // imparte. Se mira también el futuro, para que un socio recién apuntado a su
  // grupo no tarde una sesión en aparecer.
  const relations = await prisma.booking.findMany({
    where: {
      status: { in: ["BOOKED", "WAITLISTED", "ATTENDED", "NO_SHOW"] },
      occurrenceDate: { gte: since },
      session: { orgId, trainerId: actor.userId },
    },
    select: { memberId: true, session: { select: { classType: true } } },
  });
  if (relations.length === 0) return [];

  const kindsByMember = new Map<string, Set<"EP" | "GROUP">>();
  for (const rel of relations) {
    const kind = sessionServiceKind(rel.session.classType);
    const set = kindsByMember.get(rel.memberId) ?? new Set<"EP" | "GROUP">();
    set.add(kind);
    kindsByMember.set(rel.memberId, set);
  }
  const memberIds = [...kindsByMember.keys()];

  const search = opts.search?.trim();
  const members = await prisma.member.findMany({
    where: {
      orgId,
      id: { in: memberIds },
      state: { in: ["ACTIVE", "TRIAL", "FROZEN", "DELINQUENT"] },
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      subscriptions: { where: { status: "ACTIVE" }, select: { plan: { select: { name: true } } } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  const visibleIds = members.map((m) => m.id);

  const [history, upcoming, aptitude] = await Promise.all([
    prisma.booking.findMany({
      where: {
        memberId: { in: visibleIds },
        status: { in: ["ATTENDED", "NO_SHOW"] },
        occurrenceDate: { gte: daysAgo(ADHERENCE_PERIOD_DAYS) },
      },
      select: { memberId: true, status: true },
    }),
    prisma.booking.findMany({
      where: {
        memberId: { in: visibleIds },
        status: "BOOKED",
        occurrenceDate: { gte: today },
        session: { orgId, status: "SCHEDULED" },
      },
      select: { memberId: true, occurrenceDate: true, session: { select: { startTime: true } } },
      orderBy: { occurrenceDate: "asc" },
    }),
    aptitudeForMembers(orgId, visibleIds, actor, "TRAINER_MEMBERS_HEALTH_READ"),
  ]);

  const nextByMember = new Map<string, { date: Date; startTime: string }>();
  for (const b of upcoming) {
    if (!nextByMember.has(b.memberId)) nextByMember.set(b.memberId, { date: b.occurrenceDate, startTime: b.session.startTime });
  }

  const rows: TrainerMemberRow[] = members.map((m) => {
    const own = history.filter((b) => b.memberId === m.id);
    const attended = own.filter((b) => b.status === "ATTENDED").length;
    const next = nextByMember.get(m.id);
    const health = aptitude.get(m.id);
    return {
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      firstName: m.firstName,
      lastName: m.lastName,
      photoUrl: m.photoUrl,
      kinds: [...(kindsByMember.get(m.id) ?? [])],
      adherencePct: own.length ? Math.round((attended / own.length) * 100) : 0,
      attendedCount: attended,
      planNames: m.subscriptions.map((s) => s.plan.name).join(", "),
      nextLabel: next ? formatNextLabel(next.date, next.startTime, today) : null,
      light: health?.light ?? null,
      zone: health?.zone ?? null,
      condition: health?.description ?? null,
      adaptation: health?.adaptation ?? null,
    };
  });

  const filter = opts.filter ?? "all";
  if (filter === "ep") return rows.filter((r) => r.kinds.includes("EP"));
  if (filter === "group") return rows.filter((r) => r.kinds.includes("GROUP"));
  if (filter === "alerts") return rows.filter((r) => r.light === "AMBER" || r.light === "RED");
  return rows;
}

/**
 * Ficha del socio para el entrenador: cabecera, aptitud, KPIs de entrenamiento
 * y sus últimas sesiones. Nada de cobros ni de estado comercial — eso sigue
 * siendo de la ficha de dirección (`/members/[id]`).
 */
export async function getTrainerMemberDetail(
  orgId: string,
  memberId: string,
  actor: { userId: string; role: Role }
) {
  const member = await prisma.member.findFirst({
    where: { orgId, id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      birthDate: true,
      joinedAt: true,
      photoUrl: true,
      notes: true,
      subscriptions: {
        where: { status: { in: ["ACTIVE", "FROZEN"] } },
        select: {
          id: true,
          status: true,
          sessionsRemaining: true,
          sessionsIncluded: true,
          plan: { select: { name: true, type: true, sessionsIncluded: true } },
        },
      },
    },
  });
  if (!member) return null;

  // Solo las sesiones que ha dado ESTE entrenador: la ficha es su relación con
  // el socio, no el histórico completo del gimnasio.
  const bookings = await prisma.booking.findMany({
    where: { memberId, session: { orgId, trainerId: actor.userId } },
    select: {
      id: true,
      status: true,
      occurrenceDate: true,
      session: { select: { name: true, classType: true, startTime: true, endTime: true } },
      debrief: { select: { rpe: true, technique: true, attitude: true, energy: true, mobility: true, pain: true, adherence: true, progress: true, feeling: true } },
    },
    orderBy: { occurrenceDate: "desc" },
    take: 40,
  });

  const aptitude = await aptitudeForMembers(orgId, [memberId], actor, "TRAINER_MEMBER_HEALTH_READ");
  const health = aptitude.get(memberId) ?? null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const closed = bookings.filter((b) => b.status === "ATTENDED" || b.status === "NO_SHOW");
  const attended = closed.filter((b) => b.status === "ATTENDED");
  const rpeValues = bookings.map((b) => b.debrief?.rpe).filter((v): v is number => typeof v === "number");

  const notes = await prisma.memberNote.findMany({
    where: { memberId, orgId, archivedAt: null },
    select: { id: true, body: true, createdAt: true, important: true, author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    member: {
      id: member.id,
      name: `${member.firstName} ${member.lastName}`.trim(),
      firstName: member.firstName,
      phone: member.phone,
      photoUrl: member.photoUrl,
      joinedAt: formatDateParam(member.joinedAt),
      ageYears: member.birthDate ? Math.floor((Date.now() - member.birthDate.getTime()) / (365.25 * 86_400_000)) : null,
      planNames: member.subscriptions.map((s) => s.plan.name),
    },
    balances: member.subscriptions.map((s) => {
      const usage = s.sessionsRemaining == null ? null : bonoUsage(effectiveSessionsIncluded(s), s.sessionsRemaining);
      return {
        subscriptionId: s.id,
        planName: s.plan.name,
        serviceKind: planServiceKind(s.plan.type) ?? "GROUP",
        unlimited: s.sessionsRemaining == null,
        remaining: usage?.remaining ?? null,
        used: usage?.used ?? null,
        total: usage?.total ?? null,
      };
    }),
    aptitude: health
      ? { light: health.light, zone: health.zone, condition: health.description, adaptation: health.adaptation }
      : null,
    stats: {
      adherencePct: closed.length ? Math.round((attended.length / closed.length) * 100) : 0,
      sessionsThisMonth: attended.filter((b) => b.occurrenceDate >= monthStart).length,
      rpeAvg: rpeValues.length ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10 : null,
    },
    sessions: bookings.slice(0, 20).map((b) => ({
      bookingId: b.id,
      day: formatDateParam(b.occurrenceDate),
      sessionName: b.session.name,
      startTime: b.session.startTime,
      endTime: b.session.endTime,
      status: b.status,
      feeling: b.debrief?.feeling ?? null,
      scores: b.debrief
        ? {
            rpe: b.debrief.rpe,
            technique: b.debrief.technique,
            attitude: b.debrief.attitude,
            energy: b.debrief.energy,
            mobility: b.debrief.mobility,
            pain: b.debrief.pain,
            adherence: b.debrief.adherence,
            progress: b.debrief.progress,
          }
        : null,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      important: n.important,
      authorName: n.author?.name ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

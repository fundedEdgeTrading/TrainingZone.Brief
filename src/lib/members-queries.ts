import { prisma } from "@/lib/prisma";
import type { BookingStatus, MemberState } from "@prisma/client";
import { formatDateParam } from "@/lib/date-utils";
import { toMin } from "@/app/(app)/agenda/agenda-utils";

export async function listMembers(
  orgId: string,
  // `skip`/`take`: paginación opcional para el scroll infinito de la app móvil;
  // sin ellos se mantiene el listado completo que consume la web.
  opts: { q?: string; state?: MemberState; centerId?: string; skip?: number; take?: number } = {}
) {
  return prisma.member.findMany({
    where: {
      orgId,
      primaryCenterId: opts.centerId || undefined,
      state: opts.state || undefined,
      ...(opts.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: "insensitive" } },
              { lastName: { contains: opts.q, mode: "insensitive" } },
              { email: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      primaryCenter: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
    orderBy: [{ state: "asc" }, { lastName: "asc" }],
    skip: opts.skip,
    take: opts.take ?? 300,
  });
}

export async function listActiveMembersForSelect(orgId: string) {
  return prisma.member.findMany({
    where: { orgId, state: "ACTIVE" },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
}

export async function getMemberDetail(orgId: string, memberId: string) {
  return prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      primaryCenter: true,
      subscriptions: { include: { plan: true, center: true }, orderBy: { startDate: "desc" } },
      payments: { orderBy: { date: "desc" }, take: 24 },
      bookings: {
        orderBy: { bookedAt: "desc" },
        take: 30,
        include: { session: true, debrief: true },
      },
      progressEntries: { orderBy: { date: "desc" } },
      invitation: { select: { usedAt: true, expiresAt: true } },
      clientGoals: { orderBy: { createdAt: "desc" } },
    },
  });
}

// RB-PERFIL-001: secciones condicionales derivadas de las suscripciones activas,
// no de un flag nuevo. EP y online siempre tienen entrenador responsable
// explícito (RB-PERFIL-002/decisión §11.4); "solo grupos" no.
export type ServiceKind = "EP" | "GROUP" | "ONLINE";
const PLAN_TYPE_TO_SERVICE: Record<string, ServiceKind> = {
  PERSONAL_TRAINING: "EP",
  ONLINE: "ONLINE",
  MONTHLY: "GROUP",
  SESSION_PACK: "GROUP",
  DROP_IN: "GROUP",
  DUO: "GROUP",
};

// Servicio al que pertenece una sesión de agenda: las franjas de EP usan
// classType "Personal Training" (RB-AGENDA-002); el resto son de grupo. No hay
// sesiones presenciales "online" (el plan online es biblioteca de vídeo, D.2).
export function sessionServiceKind(classType: string): "EP" | "GROUP" {
  return classType === "Personal Training" ? "EP" : "GROUP";
}

export function getMemberServiceKinds(subscriptions: { status: string; plan: { type: string } }[]): ServiceKind[] {
  const kinds = new Set<ServiceKind>();
  for (const s of subscriptions) {
    if (s.status !== "ACTIVE") continue;
    const kind = PLAN_TYPE_TO_SERVICE[s.plan.type];
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

export function planServiceKind(planType: string): ServiceKind | undefined {
  return PLAN_TYPE_TO_SERVICE[planType];
}

// RB-AGENDA-003: bonos ACTIVE reducidos a (centro, modalidad) para el motor de
// reserva — un socio puede tener varios bonos a la vez, de distinta modalidad
// y distinto centro (getBookableSessions/bookSessionForMember en
// portal-queries.ts). Se ignoran los bonos ONLINE (biblioteca de vídeo, sin
// agenda presencial que reservar).
export function activeBookingSubscriptions(
  subscriptions: { status: string; centerId: string; plan: { type: string } }[]
): { centerId: string; kind: "EP" | "GROUP" }[] {
  return subscriptions
    .filter((s) => s.status === "ACTIVE")
    .map((s) => ({ centerId: s.centerId, kind: planServiceKind(s.plan.type) }))
    .filter((s): s is { centerId: string; kind: "EP" | "GROUP" } => s.kind === "EP" || s.kind === "GROUP");
}

// RB-RES-006: saldo de sesiones que le queda al socio por tipo de servicio, a
// partir de sus bonos activos. Un bono con `sessionsRemaining` null = ilimitado
// (cuota mensual / online). Se agregan varios bonos del mismo servicio.
//
// Además del saldo se expone lo ya gastado del bono contratado: `used` sale de
// `sessionsIncluded - sessionsRemaining` del propio bono (no del histórico de
// asistencias, que incluye bonos anteriores y sesiones agendadas a mano por el
// entrenador) para que "gastadas + disponibles" cuadre con el total contratado
// que ve el socio.
//
// OJO: desde que la ficha del socio permite ajustar el saldo a mano
// (members/[id]/bonos-actions.ts), esa cuadratura ya NO es un invariante:
// `remaining` puede superar `sessionsIncluded` y entonces `used` se queda en 0.
// Este objeto se sirve tal cual a la app nativa
// (api/mobile/v1/portal/agenda/route.ts), así que cualquier barra de progreso
// que se pinte con él tiene que recortar al 100 %.
export type SessionBalance = {
  serviceKind: ServiceKind;
  remaining: number | null;
  unlimited: boolean;
  used: number | null;
  total: number | null;
};

export function getSessionBalances(
  subscriptions: {
    status: string;
    sessionsRemaining: number | null;
    plan: { type: string; sessionsIncluded?: number | null };
  }[]
): SessionBalance[] {
  const byKind = new Map<ServiceKind, { remaining: number; unlimited: boolean; used: number; total: number }>();
  for (const s of subscriptions) {
    if (s.status !== "ACTIVE") continue;
    const kind = PLAN_TYPE_TO_SERVICE[s.plan.type];
    if (!kind) continue;
    const acc = byKind.get(kind) ?? { remaining: 0, unlimited: false, used: 0, total: 0 };
    if (s.sessionsRemaining == null) acc.unlimited = true;
    else {
      acc.remaining += s.sessionsRemaining;
      const included = s.plan.sessionsIncluded ?? null;
      if (included != null) {
        acc.total += included;
        acc.used += Math.max(0, included - s.sessionsRemaining);
      }
    }
    byKind.set(kind, acc);
  }
  return [...byKind.entries()].map(([serviceKind, v]) => ({
    serviceKind,
    remaining: v.unlimited ? null : v.remaining,
    unlimited: v.unlimited,
    used: v.unlimited || v.total === 0 ? null : v.used,
    total: v.unlimited || v.total === 0 ? null : v.total,
  }));
}

// RB-PERFIL-003: catálogo editable de objetivos concretos + asignación a un socio.
export async function listClientGoalTemplates(orgId: string) {
  return prisma.clientGoal.findMany({ where: { orgId, isTemplate: true }, orderBy: { label: "asc" } });
}

export async function addClientGoalTemplate(orgId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica el objetivo." };
  await prisma.clientGoal.create({ data: { orgId, label: label.trim(), isTemplate: true } });
  return { ok: true as const };
}

export async function assignClientGoal(orgId: string, memberId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica el objetivo." };
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false as const, error: "Socio no encontrado." };
  await prisma.clientGoal.create({ data: { orgId, memberId, label: label.trim(), isTemplate: false } });
  return { ok: true as const };
}

export async function markClientGoalAchieved(orgId: string, goalId: string) {
  const goal = await prisma.clientGoal.findFirst({ where: { id: goalId, orgId }, select: { id: true } });
  if (!goal) return { ok: false as const, error: "Objetivo no encontrado." };
  await prisma.clientGoal.update({ where: { id: goalId }, data: { achievedAt: new Date() } });
  return { ok: true as const };
}

export async function getMemberNotes(orgId: string, memberId: string) {
  return prisma.memberNote.findMany({
    where: { orgId, memberId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCentersForOrg(orgId: string) {
  return prisma.center.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function listActivePlansForOrg(orgId: string) {
  return prisma.membershipPlan.findMany({
    where: { orgId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function getMemberAttendanceStats(memberId: string) {
  const bookings = await prisma.booking.findMany({
    where: { memberId },
    include: { session: true },
  });
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
  const total = attended + noShow;
  return {
    attended,
    noShow,
    cancelled,
    noShowRate: total ? Math.round((noShow / total) * 100) : 0,
  };
}

// ---------- Calendario de entrenamientos del socio ----------
// Pestaña "Bonos y calendario" de la ficha del socio.
//
// Se consulta BOOKING, no CLASSSESSION: `Booking.occurrenceDate` ya materializa
// el día concreto de cada ocurrencia de una serie recurrente, así que aquí NO
// hace falta proyectar recurrencias (sessionsInRangeWhere/expandOccurrences de
// session-occurrences.ts). Expandirlas sería además incorrecto: pintaría todas
// las ocurrencias futuras de una serie semanal a la que el socio no está
// apuntado. El filtro cae justo sobre el índice Booking[memberId, occurrenceDate].
export type MemberCalendarEvent = {
  bookingId: string;
  sessionId: string;
  /** Día REAL de la ocurrencia ("YYYY-MM-DD"), no la fecha base de la serie. */
  dateISO: string;
  startTime: string; // "HH:mm"
  endTime: string;
  title: string;
  kind: "EP" | "GROUP";
  status: BookingStatus;
  /** La sesión entera está cancelada (distinto de que lo esté esta reserva). */
  sessionCancelled: boolean;
  centerId: string;
  centerName: string;
  trainerId: string | null;
  trainerName: string | null;
  hasDebrief: boolean;
};

export async function getMemberSessionCalendar(
  orgId: string,
  memberId: string,
  from: Date, // medianoche local, inclusive
  to: Date // medianoche local, EXCLUSIVO
): Promise<MemberCalendarEvent[]> {
  const bookings = await prisma.booking.findMany({
    // Aislamiento multi-tenant vía el socio: Booking tampoco tiene orgId.
    where: { memberId, member: { orgId }, occurrenceDate: { gte: from, lt: to } },
    select: {
      id: true,
      sessionId: true,
      status: true,
      occurrenceDate: true,
      debrief: { select: { id: true } },
      session: {
        select: {
          name: true,
          classType: true,
          startTime: true,
          endTime: true,
          status: true,
          trainerId: true,
          directedByUserId: true,
          center: { select: { id: true, name: true } },
          trainer: { select: { name: true } },
          directedBy: { select: { name: true } },
        },
      },
    },
  });

  return bookings
    .map((b) => ({
      bookingId: b.id,
      sessionId: b.sessionId,
      // `formatDateParam` usa componentes locales: con toISOString() el día se
      // desplazaría en Europe/Madrid (ver date-utils.ts).
      dateISO: formatDateParam(b.occurrenceDate),
      startTime: b.session.startTime,
      endTime: b.session.endTime,
      title: b.session.name,
      kind: sessionServiceKind(b.session.classType),
      status: b.status,
      sessionCancelled: b.session.status === "CANCELLED",
      centerId: b.session.center.id,
      centerName: b.session.center.name,
      // RB-AGENDA-004: manda quien la dirigió de verdad, si consta; el
      // entrenador asignado en la plantilla puede no ser el que dio la sesión.
      trainerId: b.session.directedByUserId ?? b.session.trainerId,
      trainerName: b.session.directedBy?.name ?? b.session.trainer?.name ?? null,
      hasDebrief: b.debrief != null,
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || toMin(a.startTime) - toMin(b.startTime));
}

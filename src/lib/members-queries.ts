import { prisma } from "@/lib/prisma";
import type { MemberState } from "@prisma/client";

export async function listMembers(
  orgId: string,
  opts: { q?: string; state?: MemberState; centerId?: string } = {}
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
    take: 300,
  });
}

export async function listActiveMembersForSelect(orgId: string, opts: { trainerId?: string } = {}) {
  return prisma.member.findMany({
    where: { orgId, state: "ACTIVE", trainerId: opts.trainerId || undefined },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
}

export async function getMemberDetail(orgId: string, memberId: string) {
  return prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      primaryCenter: true,
      trainer: { select: { id: true, name: true } },
      subscriptions: { include: { plan: true }, orderBy: { startDate: "desc" } },
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

// RB-RES-006: saldo de sesiones que le queda al socio por tipo de servicio, a
// partir de sus bonos activos. Un bono con `sessionsRemaining` null = ilimitado
// (cuota mensual / online). Se agregan varios bonos del mismo servicio.
export type SessionBalance = { serviceKind: ServiceKind; remaining: number | null; unlimited: boolean };

export function getSessionBalances(
  subscriptions: { status: string; sessionsRemaining: number | null; plan: { type: string } }[]
): SessionBalance[] {
  const byKind = new Map<ServiceKind, { remaining: number; unlimited: boolean }>();
  for (const s of subscriptions) {
    if (s.status !== "ACTIVE") continue;
    const kind = PLAN_TYPE_TO_SERVICE[s.plan.type];
    if (!kind) continue;
    const acc = byKind.get(kind) ?? { remaining: 0, unlimited: false };
    if (s.sessionsRemaining == null) acc.unlimited = true;
    else acc.remaining += s.sessionsRemaining;
    byKind.set(kind, acc);
  }
  return [...byKind.entries()].map(([serviceKind, v]) => ({
    serviceKind,
    remaining: v.unlimited ? null : v.remaining,
    unlimited: v.unlimited,
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

export async function setMemberTrainer(orgId: string, memberId: string, trainerId: string | null) {
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false as const, error: "Socio no encontrado." };
  await prisma.member.update({ where: { id: memberId }, data: { trainerId } });
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

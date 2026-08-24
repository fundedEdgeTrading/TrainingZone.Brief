import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionBalances,
  planServiceKind,
  sessionServiceKind,
  bonoUsage,
  effectiveSessionsIncluded,
} from "@/lib/members-queries";
import { formatDateParam } from "@/lib/date-utils";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

// B4 del handoff ("Mis bonos"): un anillo de progreso por bono y el histórico
// de consumos. Amplía lo que la agenda ya devolvía en `balances`, que solo
// agregaba el saldo por modalidad y no distinguía bonos.
export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const [subscriptions, consumption] = await Promise.all([
    prisma.subscription.findMany({
      where: { memberId: member.id, status: { in: ["ACTIVE", "FROZEN"] } },
      include: { plan: true, center: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    }),
    prisma.booking.findMany({
      where: { memberId: member.id, status: { in: ["ATTENDED", "NO_SHOW"] } },
      include: { session: { select: { name: true, classType: true, startTime: true } }, subscription: { include: { plan: { select: { name: true } } } } },
      orderBy: { occurrenceDate: "desc" },
      take: 8,
    }),
  ]);

  const balances = getSessionBalances(
    subscriptions.map((s) => ({
      status: s.status,
      sessionsRemaining: s.sessionsRemaining,
      sessionsIncluded: s.sessionsIncluded,
      plan: { type: s.plan.type, sessionsIncluded: s.plan.sessionsIncluded },
    }))
  );

  return apiOk({
    balances,
    memberships: subscriptions.map((s) => {
      // Mismo reparto cuadrado (gastadas + disponibles = total) que enseña la
      // web: el anillo de "Mis bonos" se pinta con estas tres cifras y con el
      // total contratado a secas se pasaba del 100 % en cuanto un bono tenía
      // sesiones añadidas a mano.
      const usage = bonoUsage(effectiveSessionsIncluded(s), s.sessionsRemaining);
      return {
        id: s.id,
        planName: s.plan.name,
        serviceKind: planServiceKind(s.plan.type) ?? "GROUP",
        status: s.status,
        unlimited: usage == null,
        remaining: usage?.remaining ?? null,
        total: usage?.total ?? null,
        used: usage?.used ?? null,
        priceCents: s.priceCents,
        centerName: s.center.name,
        /** Fecha de renovación/caducidad ya formateada como "YYYY-MM-DD" (null = sin vencimiento). */
        renewsAt: s.endDate ? formatDateParam(s.endDate) : null,
        cancelAt: s.cancelAt ? formatDateParam(s.cancelAt) : null,
        pauseUntil: s.pauseUntil ? formatDateParam(s.pauseUntil) : null,
        isRecurring: Boolean(s.stripeSubscriptionId),
      };
    }),
    consumption: consumption.map((b) => ({
      bookingId: b.id,
      day: formatDateParam(b.occurrenceDate),
      sessionName: b.session.name,
      startTime: b.session.startTime,
      serviceKind: sessionServiceKind(b.session.classType),
      status: b.status as "ATTENDED" | "NO_SHOW",
      planName: b.subscription?.plan.name ?? null,
      /** null = la reserva no consumió bono (cuota ilimitada o sesión agendada por el entrenador). */
      consumed: b.subscriptionId ? 1 : null,
    })),
  });
}

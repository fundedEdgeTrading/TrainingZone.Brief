import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bonoUsage, effectiveSessionsIncluded, planServiceKind, sessionServiceKind } from "@/lib/session-balance";
import { formatDateParam } from "@/lib/date-utils";
import { requireMember } from "../../_lib/require-member";
import { apiOk } from "../../_lib/response";

/**
 * «Historial de consumo» del socio: el libro mayor del bono, no la lista de
 * clases a las que fue.
 *
 * La diferencia importa. `/portal/memberships` devuelve las últimas sesiones
 * asistidas; aquí lo que se cuenta son MOVIMIENTOS de saldo, con su signo:
 * −1 al gastar, −1 en rojo cuando fue una no presentada, +1 cuando alguien la
 * devolvió (y quién: la cancelación del propio socio o el descarte del
 * entrenador) y +N en la renovación. Sin el signo y el motivo, un socio no
 * puede cuadrar por qué le quedan las sesiones que le quedan.
 */
const MAX_MOVEMENTS = 120;

type Movement = {
  id: string;
  day: string;
  concept: string;
  reason: string | null;
  serviceKind: "EP" | "GROUP" | null;
  delta: number;
  tone: "neutral" | "critical" | "good";
};

export async function GET(req: NextRequest) {
  const auth = await requireMember(req);
  if (!auth.ok) return auth.response;
  const { member } = auth;

  const [subscriptions, bookings, refunds] = await Promise.all([
    prisma.subscription.findMany({
      where: { memberId: member.id, status: { in: ["ACTIVE", "FROZEN"] } },
      include: { plan: true, center: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    }),
    prisma.booking.findMany({
      where: { memberId: member.id, status: { in: ["ATTENDED", "NO_SHOW"] } },
      select: {
        id: true,
        status: true,
        occurrenceDate: true,
        subscriptionId: true,
        session: { select: { name: true, classType: true } },
      },
      orderBy: { occurrenceDate: "desc" },
      take: MAX_MOVEMENTS,
    }),
    // Las devoluciones no viven en la reserva (al cancelar se pone
    // `subscriptionId` a null): la traza está en AuditLog, que es justamente
    // donde el descarte del entrenador deja constancia de si devolvió o no.
    prisma.auditLog.findMany({
      where: {
        orgId: member.orgId,
        memberId: member.id,
        action: { in: ["BOOKING_DISCARDED", "BOOKING_DISCARDED_REFUND_OVERRIDE"] },
      },
      select: { id: true, action: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: MAX_MOVEMENTS,
    }),
  ]);

  const consumed: Movement[] = bookings.map((b) => ({
    id: b.id,
    day: formatDateParam(b.occurrenceDate),
    concept: b.session.name,
    reason: b.status === "NO_SHOW" ? "No presentada" : null,
    serviceKind: sessionServiceKind(b.session.classType),
    delta: b.subscriptionId ? -1 : 0,
    tone: b.status === "NO_SHOW" ? "critical" : "neutral",
  }));

  const returned: Movement[] = refunds
    .filter((log) => {
      const meta = log.metadata as { refunded?: boolean } | null;
      return meta?.refunded === true;
    })
    .map((log) => {
      const meta = log.metadata as { reason?: string | null } | null;
      return {
        id: log.id,
        day: formatDateParam(log.createdAt),
        concept: "Sesión devuelta al bono",
        reason: [meta?.reason ?? null, "descarte del entrenador"].filter(Boolean).join(" · "),
        serviceKind: null,
        delta: 1,
        tone: "good" as const,
      };
    });

  const renewals: Movement[] = subscriptions
    .filter((s) => s.sessionsRemaining != null && s.plan.sessionsIncluded)
    .map((s) => ({
      id: `renewal-${s.id}`,
      day: formatDateParam(s.startDate),
      concept: `Alta de ${s.plan.name}`,
      reason: s.center.name,
      serviceKind: (planServiceKind(s.plan.type) ?? "GROUP") as "EP" | "GROUP",
      delta: s.plan.sessionsIncluded ?? 0,
      tone: "good" as const,
    }));

  const movements = [...consumed, ...returned, ...renewals]
    .filter((m) => m.delta !== 0)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, MAX_MOVEMENTS);

  return apiOk({
    balances: subscriptions.map((s) => {
      const usage = bonoUsage(effectiveSessionsIncluded(s), s.sessionsRemaining);
      return {
        subscriptionId: s.id,
        planName: s.plan.name,
        serviceKind: planServiceKind(s.plan.type) ?? "GROUP",
        unlimited: usage == null,
        remaining: usage?.remaining ?? null,
        used: usage?.used ?? null,
        total: usage?.total ?? null,
        renewsAt: s.endDate ? formatDateParam(s.endDate) : null,
      };
    }),
    summary: {
      spent: consumed.filter((m) => m.delta < 0).length,
      returned: returned.length,
      noShow: bookings.filter((b) => b.status === "NO_SHOW").length,
    },
    movements,
  });
}

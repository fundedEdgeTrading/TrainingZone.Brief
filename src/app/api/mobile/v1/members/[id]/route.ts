import type { NextRequest } from "next/server";
import type { BookingStatus, Role } from "@prisma/client";
import {
  getMemberDetail,
  getMemberAttendanceStats,
  planServiceKind,
  sessionServiceKind,
  bonoUsage,
  effectiveSessionsIncluded,
} from "@/lib/members-queries";
import { canManageMembers, canViewHealthData } from "@/lib/rbac";
import { isMemberInScope } from "@/lib/center-scope";
import { formatDateParam } from "@/lib/date-utils";
import { debriefAverage } from "../../_lib/calendar";
import { auditSessionPainRead } from "@/lib/health-access";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

// D3 del handoff: ficha del socio (cabecera, KPIs, bonos, cobros y sus
// próximas/últimas sesiones). El calendario mensual va aparte, en
// `members/[id]/calendar`, porque cambia de mes sin recargar la ficha.
//
// Nada de datos de salud: la ficha móvil de dirección no expone composición
// corporal ni condiciones (src/lib/health-access.ts sigue siendo la única vía).
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "RECEPTION", "PLATFORM_ADMIN"];

/**
 * E1-06: la reserva tal y como la ve un rol SIN acceso a datos de salud. No
 * declara `feedbackAvg` a propósito — ver el comentario en el handler.
 */
type MemberBookingDto = {
  bookingId: string;
  day: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  serviceKind: "EP" | "GROUP";
  status: BookingStatus;
  startsAtMs: number;
};

/** La misma reserva para quien sí puede ver el debrief (`canViewHealthData`). */
type MemberBookingWithDebriefDto = MemberBookingDto & { feedbackAvg: number | null };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageMembers(claims.role)) return apiError("No tienes permiso para ver los socios.", 403);
  const { id } = await params;

  const member = await getMemberDetail(claims.orgId, id);
  if (!member) return apiError("No se ha encontrado el socio.", 404);
  const inScope = await isMemberInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    member.id
  );
  if (!inScope) return apiError("No se ha encontrado el socio.", 404);
  const stats = await getMemberAttendanceStats(member.id);

  // E1-06 (RB-SEG-004): `debriefAverage` promedia movilidad y dolor invertido,
  // así que la media del debrief es dato de salud. La cabecera de este fichero
  // ya decía "nada de datos de salud", pero la ruta de escritura estaba viva:
  // con el seed salía `null` solo porque nadie había puntuado ejes todavía.
  //
  // `MemberBookingDto` no declara `feedbackAvg`, así que devolverlo por esta
  // rama sería un error de compilación, no una fuga silenciosa.
  const now = Date.now();
  const toDto = (b: (typeof member.bookings)[number]): MemberBookingDto => ({
    bookingId: b.id,
    day: formatDateParam(b.occurrenceDate),
    sessionName: b.session.name,
    startTime: b.session.startTime,
    endTime: b.session.endTime,
    serviceKind: sessionServiceKind(b.session.classType),
    status: b.status,
    startsAtMs: b.occurrenceDate.getTime(),
  });

  let bookings: (MemberBookingDto | MemberBookingWithDebriefDto)[];
  if (canViewHealthData(claims.role)) {
    const withDebrief = member.bookings.map((b) => ({ ...toDto(b), feedbackAvg: debriefAverage(b.debrief) }));
    bookings = withDebrief;

    // E3-18 · esa media lleva dentro `SessionDebrief.pain`. Quien abre esta
    // ficha no es el entrenador de la sesión sino dirección: deja traza, igual
    // que el resto de las lecturas de salud. Va dentro de la rama porque en la
    // otra el dato ni se lee, y auditar lo que no se ha leído es ruido.
    await auditSessionPainRead({
      memberId: member.id,
      orgId: claims.orgId,
      actorUserId: claims.sub,
      source: "MEMBER_DETAIL",
      debriefCount: withDebrief.filter((b) => b.feedbackAvg != null).length,
    });
  } else {
    bookings = member.bookings.map(toDto);
  }

  const booked = member.bookings.filter((b) => b.status === "BOOKED" || b.status === "WAITLISTED").length;
  const totalSessions = stats.attended + stats.noShow;

  return apiOk({
    member: {
      id: member.id,
      name: `${member.firstName} ${member.lastName}`.trim(),
      email: member.email,
      phone: member.phone,
      state: member.state,
      centerName: member.primaryCenter.name,
      joinedAt: formatDateParam(member.joinedAt),
      photoUrl: member.photoUrl,
      planNames: member.subscriptions.filter((s) => s.status === "ACTIVE").map((s) => s.plan.name),
    },
    stats: {
      attended: stats.attended,
      booked,
      noShow: stats.noShow,
      // Adherencia = asistidas sobre sesiones que llegaron a celebrarse.
      adherencePct: totalSessions ? Math.round((stats.attended / totalSessions) * 100) : 0,
    },
    memberships: member.subscriptions.map((s) => ({
      id: s.id,
      planName: s.plan.name,
      serviceKind: planServiceKind(s.plan.type) ?? "GROUP",
      status: s.status,
      // `total` es la capacidad real del bono, nunca por debajo del saldo (ver
      // bonoUsage): así "quedan R de T" no se contradice en la ficha del socio.
      remaining: s.sessionsRemaining,
      total: bonoUsage(effectiveSessionsIncluded(s), s.sessionsRemaining)?.total ?? null,
      priceCents: s.priceCents,
      centerName: s.center.name,
      renewsAt: s.endDate ? formatDateParam(s.endDate) : null,
    })),
    payments: member.payments.slice(0, 12).map((p) => ({
      id: p.id,
      date: formatDateParam(p.date),
      amountCents: p.amountCents,
      status: p.status,
      method: p.method,
    })),
    upcoming: bookings.filter((b) => b.startsAtMs >= now).sort((a, b) => a.startsAtMs - b.startsAtMs).slice(0, 5),
    recent: bookings.filter((b) => b.startsAtMs < now).sort((a, b) => b.startsAtMs - a.startsAtMs).slice(0, 6),
  });
}

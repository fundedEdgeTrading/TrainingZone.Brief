import type { NextRequest } from "next/server";
import { z } from "zod";
import type { DebriefFeeling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionBrief } from "@/lib/brief-queries";
import { canViewSessionDebrief } from "@/lib/rbac";
import { formatDateParam } from "@/lib/date-utils";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { debriefAverage } from "../../../../_lib/calendar";
import { requireApiRole } from "../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../_lib/response";

// C4 del handoff: feedback 1-10 por socio asistente, un socio por pantalla.
// Amplía el debrief 🟢🟡🔴 de `trainer/brief/[id]/debrief` con ocho ejes; el
// semáforo (`feeling`) se sigue guardando, derivado de las notas, para que el
// resto del CRM (informe semanal de dirección, panel del entrenador) no cambie.
const AXES = ["rpe", "technique", "attitude", "energy", "mobility", "pain", "adherence", "progress"] as const;
type Axis = (typeof AXES)[number];

const score = z.number().int().min(1).max(10).nullable().optional();
const bodySchema = z.object({
  bookingId: z.string().trim().min(1),
  scores: z
    .object({
      rpe: score,
      technique: score,
      attitude: score,
      energy: score,
      mobility: score,
      pain: score,
      adherence: score,
      progress: score,
    })
    .default({}),
  note: z.string().trim().max(600).nullable().optional(),
});

function feelingFor(scores: Record<Axis, number | null>): DebriefFeeling {
  const average = debriefAverage({ ...scores });
  if (average == null) return "AMBER";
  if (average >= 7) return "GREEN";
  if (average >= 4.5) return "AMBER";
  return "RED";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  // getSessionBrief ya aplica canViewSessionDebrief (confidencial del
  // entrenador que dirigió la sesión + dirección) y filtra el roster del día.
  const brief = await getSessionBrief({
    orgId: claims.orgId,
    sessionId: id,
    actorUserId: claims.sub,
    actorRole: claims.role,
    d: req.nextUrl.searchParams.get("d"),
  });
  if (!brief) return apiError("No se ha encontrado esa sesión.", 404);
  const { session, roster, occurrenceDate, canSeeHealth } = brief;

  const memberIds = roster.map((r) => r.member.id);
  const monthStart = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), 1);
  const monthEnd = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth() + 1, 1);

  const [monthlyBookings, subscriptions] = await Promise.all([
    memberIds.length
      ? prisma.booking.groupBy({
          by: ["memberId"],
          where: { memberId: { in: memberIds }, status: "ATTENDED", occurrenceDate: { gte: monthStart, lt: monthEnd } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    memberIds.length
      ? prisma.subscription.findMany({
          where: { memberId: { in: memberIds }, status: "ACTIVE" },
          select: { memberId: true, plan: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const monthlyCount = new Map(monthlyBookings.map((row) => [row.memberId, row._count._all]));
  const plansByMember = new Map<string, string[]>();
  for (const s of subscriptions) {
    plansByMember.set(s.memberId, [...(plansByMember.get(s.memberId) ?? []), s.plan.name]);
  }

  return apiOk({
    session: {
      id: session.id,
      name: session.name,
      classType: session.classType,
      startTime: session.startTime,
      endTime: session.endTime,
      centerName: session.center.name,
      trainerName: session.trainer?.name ?? null,
      occurrenceDate: formatDateParam(occurrenceDate),
    },
    members: roster.map((entry) => ({
      bookingId: entry.bookingId,
      memberId: entry.member.id,
      name: `${entry.member.firstName} ${entry.member.lastName}`.trim(),
      attended: entry.debrief != null,
      monthlyCount: monthlyCount.get(entry.member.id) ?? 0,
      planNames: plansByMember.get(entry.member.id) ?? [],
      // Semáforo de Aptitud: solo si el rol puede ver datos de salud.
      aptitude:
        canSeeHealth && entry.light && entry.light !== "GREEN"
          ? { zone: entry.matchedRules[0]?.injuryZone ?? null, light: entry.light }
          : null,
      scores: Object.fromEntries(AXES.map((axis) => [axis, entry.debrief?.[axis] ?? null])) as Record<Axis, number | null>,
      note: entry.debrief?.note ?? null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id: sessionId } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  const { bookingId, scores, note } = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId: claims.orgId } },
    select: { id: true, debrief: true, session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return apiError("No se ha encontrado esa reserva.", 404);

  if (!canViewSessionDebrief(claims.role, claims.sub, booking.session)) {
    return apiError("No tienes permiso para registrar el feedback de esta sesión.", 403);
  }

  // Guardado optimista por eje: cada POST fusiona lo recibido con lo ya
  // guardado, de modo que salir a mitad no pierde lo puntuado.
  const merged = Object.fromEntries(
    AXES.map((axis) => [axis, scores[axis] !== undefined ? scores[axis] ?? null : booking.debrief?.[axis] ?? null])
  ) as Record<Axis, number | null>;
  const feeling = feelingFor(merged);
  const mergedNote = note !== undefined ? note : booking.debrief?.note ?? null;

  await prisma.$transaction([
    prisma.sessionDebrief.upsert({
      where: { bookingId },
      create: { bookingId, feeling, note: mergedNote, ...merged },
      update: { feeling, note: mergedNote, ...merged },
    }),
    // Igual que el debrief 🟢🟡🔴: puntuar a un socio marca su asistencia.
    prisma.booking.update({ where: { id: bookingId }, data: { status: "ATTENDED", checkedInAt: new Date() } }),
  ]);

  revalidateSessionViews(sessionId);
  return apiOk({ saved: true, feeling, average: debriefAverage({ ...merged }) });
}

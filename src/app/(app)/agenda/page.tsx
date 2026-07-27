import { requireRole } from "@/lib/guard";
import { getCentersForUser, getWeekSessions } from "@/lib/agenda-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { listActiveMembersForSelect } from "@/lib/members-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { startOfWeekMonday, formatDateParam, parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { instanceForWeek, type WeekOccurrence } from "./agenda-utils";
import AgendaView from "./agenda-view";
import CenterSwitcher from "./center-switcher";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; week?: string; day?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const params = await searchParams;

  const centers = await getCentersForUser(session.user);
  const centerId = params.center || session.user.centerId || centers[0]?.id;

  // `day` solo lo usa la vista móvil (un día por pantalla) al saltar de semana
  // con las flechas: marca con qué día debe abrirse la semana de destino.
  const dayParam = Number(params.day);
  const initialDayIndex = Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 6 ? dayParam : null;

  // Sin `?week`, la agenda abre en la semana en curso *del centro*: con la hora
  // del servidor (UTC) un domingo por la noche en España abría la semana anterior.
  const refDate = params.week
    ? parseDateParam(params.week)
    : zonedNow(await resolveTimezoneForCenter(centerId));
  const weekStart = startOfWeekMonday(refDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const sessions = centerId ? await getWeekSessions(session.user.orgId, centerId, weekStart, weekEnd) : [];
  const canEdit = Boolean(centerId) && canManageEpSlots(session.user.role);

  const [trainers, members] = centerId
    ? await Promise.all([
        listAssignableStaff(session.user.orgId, ["TRAINER"]),
        listActiveMembersForSelect(session.user.orgId),
      ])
    : [[], []];

  const occurrences: WeekOccurrence[] = [];
  for (const s of sessions) {
    const dayIndex = instanceForWeek(s, weekStart, weekEnd);
    if (dayIndex === null) continue;
    if (!s.trainerId) continue;
    const booking = s.bookings.find((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW");
    occurrences.push({
      id: s.id,
      dayIndex,
      startMin: toMinutes(s.startTime),
      endMin: toMinutes(s.endTime),
      title: s.name,
      trainerId: s.trainerId,
      type: s.classType === "Personal Training" ? "personal" : "reduced",
      isTrial: s.isTrial,
      isRecurring: s.recurrence !== "NONE",
      bookedMemberId: booking?.memberId ?? null,
      status: s.status,
    });
  }

  return (
    // En móvil la agenda ocupa todo el hueco visible (cabecera 72px + padding
    // del main 16/40) para que la rejilla no compita con el scroll de página.
    <div className="tz-page h-[calc(100dvh-128px)] min-h-[420px] lg:h-[calc(100vh-140px)] lg:min-h-[560px] bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden tz-fade-up">
      <AgendaView
        key={formatDateParam(weekStart)}
        initialDayIndex={initialDayIndex}
        weekStartISO={formatDateParam(weekStart)}
        centerId={centerId ?? ""}
        occurrences={occurrences}
        trainers={trainers.map((t) => ({ id: t.id, name: t.name }))}
        members={members}
        canEdit={canEdit}
        currentUserId={session.user.id}
        isDirection={session.user.role === "OWNER" || session.user.role === "CENTER_DIRECTOR"}
        centerSwitcher={
          centers.length > 1 ? <CenterSwitcher key="center-switcher" centers={centers} currentCenterId={centerId ?? ""} /> : null
        }
      />
    </div>
  );
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

import { requireRole } from "@/lib/guard";
import { getCentersForUser, getWeekSessions } from "@/lib/agenda-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { listActiveMembersForSelect } from "@/lib/members-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { startOfWeekMonday, formatDateParam, parseDateParam } from "@/lib/date-utils";
import { instanceForWeek, type WeekOccurrence } from "./agenda-utils";
import AgendaView from "./agenda-view";
import CenterSwitcher from "./center-switcher";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; week?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const params = await searchParams;

  const centers = await getCentersForUser(session.user);
  const centerId = params.center || session.user.centerId || centers[0]?.id;

  const refDate = params.week ? parseDateParam(params.week) : new Date();
  const weekStart = startOfWeekMonday(refDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const sessions = centerId ? await getWeekSessions(session.user.orgId, centerId, weekStart, weekEnd) : [];
  const canEdit = Boolean(centerId) && canManageEpSlots(session.user.role);

  const [trainers, members] = centerId
    ? await Promise.all([
        listAssignableStaff(session.user.orgId, ["TRAINER"]),
        listActiveMembersForSelect(session.user.orgId, { trainerId: session.user.role === "TRAINER" ? session.user.id : undefined }),
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
    <div className="tz-page h-[calc(100vh-140px)] min-h-[560px] bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden tz-fade-up">
      <AgendaView
        key={formatDateParam(weekStart)}
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

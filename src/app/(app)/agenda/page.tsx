import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getCentersForUser, getWeekSessions } from "@/lib/agenda-queries";
import { PageHeader } from "@/components/ui/page-header";
import CalendarView from "./calendar-view";
import CenterSwitcher from "./center-switcher";

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; week?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const params = await searchParams;

  const centers = await getCentersForUser(session.user);
  const centerId = params.center || session.user.centerId || centers[0]?.id;

  const refDate = params.week ? new Date(params.week) : new Date();
  const weekStart = startOfWeekMonday(refDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const sessions = centerId
    ? await getWeekSessions(session.user.orgId, centerId, weekStart, weekEnd)
    : [];

  const events = sessions.map((s) => ({
    id: s.id,
    name: s.name,
    classType: s.classType,
    date: s.date.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    bookedCount: s.bookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW").length,
    waitlistCount: s.bookings.filter((b) => b.status === "WAITLISTED").length,
    trainerName: s.trainer?.name ?? null,
    status: s.status,
  }));

  const weekLabel = `${weekStart.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} – ${new Date(
    weekEnd.getTime() - 86400000
  ).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}`;

  const linkClass =
    "rounded-control border border-brand-border bg-white px-3.5 py-2 text-sm font-semibold text-brand-text transition-colors duration-150 hover:border-brand-ink hover:bg-tz-bone";

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        description={`Semana del ${weekLabel} · ${sessions.length} sesiones`}
        actions={
          <>
            <CenterSwitcher centers={centers} currentCenterId={centerId ?? ""} />
            <Link href={`/agenda?center=${centerId}&week=${prevWeek.toISOString().slice(0, 10)}`} className={linkClass}>
              ← Semana anterior
            </Link>
            <Link href={`/agenda?center=${centerId}&week=${new Date().toISOString().slice(0, 10)}`} className={linkClass}>
              Hoy
            </Link>
            <Link href={`/agenda?center=${centerId}&week=${nextWeek.toISOString().slice(0, 10)}`} className={linkClass}>
              Semana siguiente →
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: "#6B7A34" }} /> Ocupación normal
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: "#B98A2E" }} /> Casi lleno (≥70%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: "#B5482F" }} /> Lleno / lista de espera
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: "#D8CCB8" }} /> Cancelada
        </span>
      </div>

      <CalendarView sessions={events} />
    </div>
  );
}

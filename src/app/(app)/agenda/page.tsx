import { requireRole } from "@/lib/guard";
import { getCentersForUser, getWeekSessions } from "@/lib/agenda-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { listActiveMembersForSelect } from "@/lib/members-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { startOfWeekMonday, formatDateParam, parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { isSameDay } from "@/lib/session-occurrences";
import { addDays, instancesForWeek, VISIBLE_DAYS, type WeekOccurrence } from "./agenda-utils";
import AgendaView from "./agenda-view";
import CenterSwitcher from "./center-switcher";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; week?: string; day?: string; view?: string; full?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const params = await searchParams;

  const centers = await getCentersForUser(session.user);
  // `?center=` es de quien escribe la URL, así que NO puede elegir centro: solo
  // elegir entre los suyos. Sin este filtro, una dirección de centro (o un
  // entrenador, o recepción) leía la agenda completa de cualquier otro centro
  // de la organización con solo cambiar el id a mano — mientras el selector de
  // centro, que sí respeta la imputación, solo le ofrecía el suyo.
  const allowed = new Set(centers.map((c) => c.id));
  const requested = params.center && allowed.has(params.center) ? params.center : null;
  const base = session.user.centerId && allowed.has(session.user.centerId) ? session.user.centerId : null;
  const centerId = requested ?? base ?? centers[0]?.id;
  const currentCenter = centers.find((c) => c.id === centerId) ?? null;

  // `day` solo lo usa la vista móvil (un día por pantalla) al saltar de semana
  // con las flechas: marca con qué día debe abrirse la semana de destino.
  const dayParam = Number(params.day);
  const initialDayIndex = Number.isInteger(dayParam) && dayParam >= 0 && dayParam < VISIBLE_DAYS ? dayParam : null;
  // La navegación por flechas re-crea AgendaView (cambia `weekStartISO`), así
  // que el modo semana de móvil viaja en la URL igual que `day`, o se perdía
  // al pasar de semana.
  const initialMobileWeekView = params.view === "week";
  // Igual que `view`: la agenda a pantalla completa sobrevive al salto de
  // semana porque el modo viaja en la URL, no en el estado del componente.
  const initialExpanded = params.full === "1";

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
        listAssignableStaff(session.user.orgId, ["TRAINER", "TRAINER_ADMIN"], centerId),
        listActiveMembersForSelect(session.user.orgId),
      ])
    : [[], []];

  const occurrences: WeekOccurrence[] = [];
  for (const s of sessions) {
    if (!s.trainerId) continue;
    for (const dayIndex of instancesForWeek(s, weekStart, weekEnd)) {
    // Fuera de la semana visible (ver `VISIBLE_DAYS`): no hay columna donde pintarla.
    if (dayIndex >= VISIBLE_DAYS) continue;
    // Reservas del día que se pinta: en una serie recurrente todas las
    // ocurrencias comparten fila, y contarlas juntas inflaba el aforo.
    const occurrenceDay = addDays(weekStart, dayIndex);
    const active = s.bookings.filter(
      (b) =>
        isSameDay(b.occurrenceDate, occurrenceDay) &&
        (b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW")
    );
    occurrences.push({
      id: s.id,
      uid: `${s.id}:${dayIndex}`,
      dayIndex,
      startMin: toMinutes(s.startTime),
      endMin: toMinutes(s.endTime),
      title: s.name,
      trainerId: s.trainerId,
      type: s.classType === "Personal Training" ? "personal" : "reduced",
      capacity: s.capacity,
      selfBookable: s.selfBookable,
      isTrial: s.isTrial,
      isRecurring: s.recurrence !== "NONE",
      recurrence: s.recurrence,
      recUntilISO: s.recUntil ? formatDateParam(s.recUntil) : null,
      bookedMemberId: active[0]?.memberId ?? null,
      bookedMemberName: active[0]?.member
        ? `${active[0].member.firstName} ${active[0].member.lastName}`
        : null,
      bookedCount: active.length,
      status: s.status,
    });
    }
  }

  return (
    // En móvil la agenda ocupa todo el hueco visible (cabecera 72px + padding
    // del main 16/40) para que la rejilla no compita con el scroll de página.
    <div className="tz-page h-[calc(100dvh-128px)] min-h-[420px] lg:h-[calc(100vh-140px)] lg:min-h-[560px] bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden tz-fade-up">
      <AgendaView
        key={formatDateParam(weekStart)}
        initialDayIndex={initialDayIndex}
        initialMobileWeekView={initialMobileWeekView}
        initialExpanded={initialExpanded}
        weekStartISO={formatDateParam(weekStart)}
        centerId={centerId ?? ""}
        occurrences={occurrences}
        trainers={trainers.map((t) => ({ id: t.id, name: t.name }))}
        members={members}
        canEdit={canEdit}
        defaultGroupCapacity={currentCenter?.defaultGroupCapacity ?? null}
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

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, getBookableSessions, canCancelWithoutPenalty } from "@/lib/portal-queries";
import BookingButton from "./booking-button";

export default async function PortalAgendaPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const sessions = await getBookableSessions(session.user.orgId, member.primaryCenterId, member.id);

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reservar clase</h1>
        <p className="text-sm text-slate-500">
          {member.primaryCenter?.name ?? ""} · puedes reservar hasta 7 días vista
          (máx. 3 reservas activas a la vez).
        </p>
      </div>

      {Array.from(byDay.entries()).map(([day, daySessions]) => (
        <div key={day} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 text-sm font-semibold text-slate-700 capitalize">{day}</div>
          <div className="divide-y divide-slate-100">
            {daySessions.map((s) => {
              const full = s.bookedCount >= s.capacity;
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-slate-800">
                      {s.startTime} · {s.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {s.trainerName ?? "Sin entrenador"} · {s.bookedCount}/{s.capacity} plazas
                      {full && !s.myBookingId && " · lista de espera"}
                    </div>
                  </div>
                  <BookingButton
                    sessionId={s.id}
                    myBookingId={s.myBookingId}
                    myBookingStatus={s.myBookingStatus}
                    canCancelFreely={canCancelWithoutPenalty(s.startsAt)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {sessions.length === 0 && (
        <p className="text-sm text-slate-500">No hay sesiones disponibles en los próximos 7 días.</p>
      )}
    </div>
  );
}

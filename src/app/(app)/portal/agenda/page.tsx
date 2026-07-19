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
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      <div className="bg-tz-sand rounded-2xl px-[26px] py-[22px] tz-fade-up">
        <div className="font-display font-extrabold text-2xl uppercase text-tz-black leading-none">
          Reserva tu próxima clase
        </div>
        <p className="text-sm text-brand-text-2 mt-1.5 font-medium">
          Hasta 7 días vista · máximo 3 reservas activas a la vez.
        </p>
      </div>

      {Array.from(byDay.entries()).map(([day, daySessions], dayIdx) => (
        <div
          key={day}
          className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden tz-fade-up"
          style={{ animationDelay: `${0.06 + dayIdx * 0.06}s` }}
        >
          <div className="px-5 py-3 bg-brand-ink font-display font-bold text-[13px] tracking-[.08em] uppercase text-tz-bone capitalize">
            {day}
          </div>
          <div className="flex flex-col">
            {daySessions.map((s, i) => {
              const full = s.bookedCount >= s.capacity;
              const booked = !!s.myBookingId;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-4 px-5 py-[15px] ${i > 0 ? "border-t border-[#f0efe9]" : ""}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="font-display font-extrabold text-xl text-brand-text w-[58px] shrink-0">
                      {s.startTime}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-brand-text truncate">{s.name}</div>
                      <div className="text-xs text-brand-muted mt-px truncate">
                        {s.trainerName ?? "Sin entrenador"} · {s.bookedCount}/{s.capacity} plazas
                        {full && !booked && " · lista de espera"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {booked && (
                      <span className="inline-flex items-center bg-[#e9f9ef] text-good rounded-full px-[11px] py-1 text-xs font-bold">
                        Reservada
                      </span>
                    )}
                    <BookingButton
                      sessionId={s.id}
                      myBookingId={s.myBookingId}
                      myBookingStatus={s.myBookingStatus}
                      full={full}
                      canCancelFreely={canCancelWithoutPenalty(s.startsAt)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {sessions.length === 0 && (
        <p className="text-sm text-brand-muted">No hay sesiones disponibles en los próximos 7 días.</p>
      )}
    </div>
  );
}

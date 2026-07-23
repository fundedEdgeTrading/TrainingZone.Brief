import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, getBookableSessions, canCancelWithoutPenalty, getPendingSessionFeedback } from "@/lib/portal-queries";
import { getMemberServiceKinds, getSessionBalances } from "@/lib/members-queries";
import { getOnlineWorkouts } from "@/lib/online-queries";
import BookingButton from "./booking-button";
import { PostSessionFeedbackPrompts } from "./post-session-feedback";
import { OnlineWorkoutLibrary } from "./online-library";

const SERVICE_LABEL: Record<string, string> = { EP: "Entrenamiento personal", GROUP: "Grupos reducidos" };

export default async function PortalAgendaPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
  const balances = getSessionBalances(
    member.subscriptions.map((s) => ({ status: s.status, sessionsRemaining: s.sessionsRemaining, plan: { type: s.plan.type } }))
  );
  const hasOnline = serviceKinds.includes("ONLINE");
  const hasPresencial = serviceKinds.includes("GROUP") || serviceKinds.includes("EP");

  const [sessions, pendingFeedback, onlineWorkouts] = await Promise.all([
    getBookableSessions(session.user.orgId, member.primaryCenterId, member.id, {
      trainerId: member.trainerId,
      hasGroupService: serviceKinds.includes("GROUP"),
      hasEpService: serviceKinds.includes("EP"),
    }),
    getPendingSessionFeedback(member.id),
    hasOnline ? getOnlineWorkouts(session.user.orgId) : Promise.resolve([]),
  ]);

  // Saldo agotado en alguno de sus servicios: se avisa para renovar (RB-RES-006).
  const depleted = balances.filter((b) => !b.unlimited && (b.remaining ?? 0) <= 0);

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      <div className="bg-tz-sand rounded-2xl px-[26px] py-[22px] tz-fade-up">
        <div className="font-display font-extrabold text-2xl uppercase text-tz-black leading-none">
          {hasOnline && !hasPresencial ? "Tus entrenamientos online" : "Reserva tu próxima clase"}
        </div>
        <p className="text-sm text-brand-text-2 mt-1.5 font-medium">
          {hasOnline && !hasPresencial
            ? "Entrena cuando quieras con tu biblioteca de sesiones preparadas."
            : "Hasta 7 días vista · máximo 3 reservas activas a la vez."}
        </p>
      </div>

      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 tz-fade-up" style={{ animationDelay: "0.03s" }}>
          {balances.map((b) => (
            <div
              key={b.serviceKind}
              className="flex items-center justify-between bg-brand-card border border-brand-border rounded-2xl px-5 py-4"
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">
                  {SERVICE_LABEL[b.serviceKind] ?? b.serviceKind}
                </div>
                <div className="text-sm text-brand-muted mt-0.5">Sesiones disponibles en tu bono</div>
              </div>
              <div className="text-right">
                {b.unlimited ? (
                  <span className="font-display font-extrabold text-2xl text-good">∞</span>
                ) : (
                  <span
                    className={`font-display font-extrabold text-3xl leading-none ${
                      (b.remaining ?? 0) <= 0 ? "text-critical" : (b.remaining ?? 0) <= 2 ? "text-warning" : "text-brand-text"
                    }`}
                  >
                    {b.remaining ?? 0}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {depleted.length > 0 && (
        <div className="bg-[#fdecea] border border-[#f3c8c1] rounded-2xl px-5 py-4 flex items-start gap-3 tz-fade-up">
          <span className="w-2.5 h-2.5 rounded-full bg-critical mt-1.5 shrink-0" />
          <div>
            <div className="text-sm font-bold text-critical">
              Te has quedado sin sesiones en tu bono de{" "}
              {depleted.map((d) => (SERVICE_LABEL[d.serviceKind] ?? d.serviceKind).toLowerCase()).join(" y ")}.
            </div>
            <p className="text-[13px] text-brand-text-2 mt-0.5">
              Renueva tu bono en recepción para seguir reservando tus sesiones.
            </p>
          </div>
        </div>
      )}

      {hasOnline && <OnlineWorkoutLibrary workouts={onlineWorkouts} />}

      {pendingFeedback.length > 0 && (
        <PostSessionFeedbackPrompts
          items={pendingFeedback.map((p) => ({
            bookingId: p.bookingId,
            sessionName: p.sessionName,
            sessionDate: p.sessionDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }),
          }))}
        />
      )}

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

      {sessions.length === 0 && hasPresencial && (
        <p className="text-sm text-brand-muted">No hay sesiones disponibles en los próximos 7 días.</p>
      )}
    </div>
  );
}

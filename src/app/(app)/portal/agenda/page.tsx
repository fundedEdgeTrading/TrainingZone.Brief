import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import {
  getMemberForUser,
  getBookableSessions,
  getPendingSessionFeedback,
  getMemberUpcomingBookings,
  MAX_ACTIVE_BOOKINGS,
  BOOKING_WINDOW_DAYS,
} from "@/lib/portal-queries";
import { getMemberServiceKinds, getSessionBalances } from "@/lib/members-queries";
import { getOnlineWorkouts } from "@/lib/online-queries";
import { resolveTimezone } from "@/lib/timezone";
import SessionCard from "./session-card";
import UpcomingBookings from "./upcoming-bookings";
import { PostSessionFeedbackPrompts } from "./post-session-feedback";
import { OnlineWorkoutLibrary } from "./online-library";

const SERVICE_LABEL: Record<string, string> = { EP: "Entrenamiento personal", GROUP: "Grupos reducidos" };

export default async function PortalAgendaPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
  const balances = getSessionBalances(
    member.subscriptions.map((s) => ({
      status: s.status,
      sessionsRemaining: s.sessionsRemaining,
      plan: { type: s.plan.type, sessionsIncluded: s.plan.sessionsIncluded },
    }))
  );
  const hasOnline = serviceKinds.includes("ONLINE");
  const hasPresencial = serviceKinds.includes("GROUP") || serviceKinds.includes("EP");

  // Las horas de las clases son reloj de pared del centro del socio: las
  // cuentas atrás y la ventana de cancelación se miden con esa zona.
  const timezone = await resolveTimezone(member.primaryCenter.timezone);

  const [sessions, pendingFeedback, onlineWorkouts, upcomingBookings] = await Promise.all([
    getBookableSessions(
      session.user.orgId,
      member.primaryCenterId,
      member.id,
      {
        trainerId: member.trainerId,
        hasGroupService: serviceKinds.includes("GROUP"),
        hasEpService: serviceKinds.includes("EP"),
      },
      timezone
    ),
    getPendingSessionFeedback(member.id, timezone),
    hasOnline ? getOnlineWorkouts(session.user.orgId) : Promise.resolve([]),
    getMemberUpcomingBookings(member.id, timezone),
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
            : `Hasta ${BOOKING_WINDOW_DAYS} días vista · máximo ${MAX_ACTIVE_BOOKINGS} reservas activas a la vez.`}
        </p>
      </div>

      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 tz-fade-up" style={{ animationDelay: "0.03s" }}>
          {balances.map((b) => (
            <div
              key={b.serviceKind}
              className="bg-brand-card border border-brand-border rounded-2xl px-5 py-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {b.serviceKind === "GROUP" ? (
                    <span className="inline-flex items-center shrink-0">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#4b5a22]" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#7d8a54] -ml-[5px] border-2 border-white" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#aab488] -ml-[5px] border-2 border-white" />
                    </span>
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-brand-ink shrink-0" />
                  )}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">
                      {SERVICE_LABEL[b.serviceKind] ?? b.serviceKind}
                    </div>
                    <div className="text-sm text-brand-muted mt-0.5">Sesiones disponibles en tu bono</div>
                  </div>
                </div>
                <div className="text-right">
                  {b.unlimited ? (
                    <span className="font-display font-extrabold text-3xl leading-none tabular-nums text-good">∞</span>
                  ) : (
                    <span
                      className={`font-display font-extrabold text-3xl leading-none tabular-nums ${
                        (b.remaining ?? 0) <= 0 ? "text-critical" : (b.remaining ?? 0) <= 2 ? "text-warning" : "text-brand-text"
                      }`}
                    >
                      {b.remaining ?? 0}
                    </span>
                  )}
                </div>
              </div>

              {/* Consumo del bono contratado: el saldo restante ya se veía, pero
                  no cuántas sesiones llevaba gastadas ni sobre qué total. */}
              {b.used != null && b.total != null && (
                <div className="mt-3.5">
                  <div className="h-1.5 rounded-full bg-tz-sand overflow-hidden">
                    <div
                      className="h-full bg-good rounded-full origin-left [animation:tzGrow_.7s_ease-out_both]"
                      style={{ width: `${Math.min(100, Math.round((b.used / b.total) * 100))}%` }}
                    />
                  </div>
                  <div className="text-xs font-semibold text-brand-muted mt-1.5 tabular-nums">
                    {b.used} {b.used === 1 ? "sesión gastada" : "sesiones gastadas"} de {b.total} del bono
                  </div>
                </div>
              )}
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

      <UpcomingBookings bookings={upcomingBookings} />

      {hasOnline && <OnlineWorkoutLibrary workouts={onlineWorkouts} />}

      {pendingFeedback.length > 0 && (
        <PostSessionFeedbackPrompts
          items={pendingFeedback.map((p) => ({
            bookingId: p.bookingId,
            sessionName: p.sessionName,
            startTime: p.time,
            trainerName: p.trainerName,
            sessionDate: p.sessionDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }),
          }))}
        />
      )}

      {Array.from(byDay.entries()).map(([day, daySessions], dayIdx) => (
        <div key={day} className="tz-fade-up" style={{ animationDelay: `${0.1 + dayIdx * 0.08}s` }}>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="font-display font-extrabold text-[13px] uppercase tracking-[.08em] text-brand-text capitalize">
              {day}
            </span>
            <span className="flex-1 h-px bg-[#e0d9cb]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {daySessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      ))}

      {sessions.length === 0 && hasPresencial && (
        <p className="text-sm text-brand-muted">No hay sesiones disponibles en los próximos 7 días.</p>
      )}
    </div>
  );
}

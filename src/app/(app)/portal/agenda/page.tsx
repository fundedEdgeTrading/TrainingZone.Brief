import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/guard";
import {
  getMemberForUser,
  getBookableSessions,
  getMemberUpcomingBookings,
  BOOKING_WINDOW_DAYS,
  CANCEL_WINDOW_HOURS,
} from "@/lib/portal-queries";
import { getMemberServiceKinds, getSessionBalances, activeBookingSubscriptions } from "@/lib/members-queries";
import { serviceLabel, serviceLabelLower } from "@/lib/service-labels";
import { getOnlineWorkouts } from "@/lib/online-queries";
import { resolveTimezone } from "@/lib/timezone";
import SessionCard from "./session-card";
import UpcomingBookings from "./upcoming-bookings";
import { OnlineWorkoutLibrary } from "./online-library";
import { sessionServiceKind } from "@/lib/members-queries";
import { AgendaFilterBar } from "./agenda-filter-bar";
import { filterAgendaSessions, distinctAgendaDays, parseModality, type AgendaModality } from "./agenda-filters";

export default async function PortalAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; modalidad?: string }>;
}) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
  const balances = getSessionBalances(
    member.subscriptions.map((s) => ({
      status: s.status,
      sessionsRemaining: s.sessionsRemaining,
      sessionsIncluded: s.sessionsIncluded,
      plan: { type: s.plan.type, sessionsIncluded: s.plan.sessionsIncluded },
    }))
  );
  const hasOnline = serviceKinds.includes("ONLINE");
  const hasPresencial = serviceKinds.includes("GROUP") || serviceKinds.includes("EP");

  // Las horas de las clases son reloj de pared del centro del socio: las
  // cuentas atrás y la ventana de cancelación se miden con esa zona.
  const timezone = await resolveTimezone(member.primaryCenter.timezone);

  const [sessions, onlineWorkouts, upcomingBookings] = await Promise.all([
    getBookableSessions(session.user.orgId, member.id, activeBookingSubscriptions(member.subscriptions), timezone),
    hasOnline ? getOnlineWorkouts(session.user.orgId) : Promise.resolve([]),
    getMemberUpcomingBookings(member.id, timezone),
  ]);

  // Saldo agotado en alguno de sus servicios: se avisa para renovar (RB-RES-006).
  const depleted = balances.filter((b) => !b.unlimited && (b.remaining ?? 0) <= 0);

  // E5-07: filtro por día y modalidad, con el estado en la URL.
  const { dia, modalidad: modalidadRaw } = await searchParams;
  const modalidad = parseModality(modalidadRaw);
  const availableModalities = [...new Set(sessions.map((s) => sessionServiceKind(s.classType)))] as AgendaModality[];
  const byModalitySessions = filterAgendaSessions(sessions, { modality: modalidad });
  const dayOptions = distinctAgendaDays(byModalitySessions);
  const filteredSessions = filterAgendaSessions(sessions, { day: dia, modality: modalidad });

  const byDay = new Map<string, typeof sessions>();
  for (const s of filteredSessions) {
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
            : `Hasta ${BOOKING_WINDOW_DAYS} días vista · reserva tantas sesiones como te queden en tu bono.`}
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
                      <span className="w-3.5 h-3.5 rounded-full bg-good" />
                      <span className="w-3.5 h-3.5 rounded-full bg-good/70 -ml-[5px] border-2 border-brand-card" />
                      <span className="w-3.5 h-3.5 rounded-full bg-good/45 -ml-[5px] border-2 border-brand-card" />
                    </span>
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-brand-ink shrink-0" />
                  )}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">
                      {serviceLabel(b.serviceKind)}
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

              {/* Consumo del bono: el saldo restante ya se veía, pero no cuántas
                  sesiones llevaba gastadas ni sobre qué total. `getSessionBalances`
                  garantiza que gastadas + disponibles dan el total, así que la
                  barra nunca se pasa del 100 %. */}
              {b.used != null && b.total != null && (
                <div className="mt-3.5">
                  <div className="h-1.5 rounded-full bg-tz-sand overflow-hidden">
                    <div
                      className="h-full bg-good rounded-full origin-left [animation:tzGrow_.7s_ease-out_both]"
                      style={{ width: `${Math.round((b.used / b.total) * 100)}%` }}
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
        <div className="bg-critical-bg border border-critical rounded-2xl px-5 py-4 flex items-start gap-3 tz-fade-up">
          <span className="w-2.5 h-2.5 rounded-full bg-critical mt-1.5 shrink-0" />
          <div>
            <div className="text-sm font-bold text-critical">
              Te has quedado sin sesiones en tu bono de{" "}
              {depleted.map((d) => serviceLabelLower(d.serviceKind)).join(" y ")}.
            </div>
            <p className="text-[13px] text-brand-text-2 mt-0.5">
              Renueva tu bono para seguir reservando tus sesiones.{" "}
              <Link href="/portal/membresia" className="font-semibold underline underline-offset-2 hover:text-critical">
                Comprar o renovar →
              </Link>
            </p>
          </div>
        </div>
      )}

      <UpcomingBookings bookings={upcomingBookings} cancelWindowHours={CANCEL_WINDOW_HOURS} />

      {hasPresencial && (
        <AgendaFilterBar days={dayOptions} modalities={availableModalities} selectedDay={dia} selectedModality={modalidad} />
      )}

      {hasOnline && <OnlineWorkoutLibrary workouts={onlineWorkouts} />}

      {Array.from(byDay.entries()).map(([day, daySessions], dayIdx) => (
        <div key={day} className="tz-fade-up" style={{ animationDelay: `${0.1 + dayIdx * 0.08}s` }}>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="font-display font-extrabold text-[13px] uppercase tracking-[.08em] text-brand-text capitalize">
              {day}
            </span>
            <span className="flex-1 h-px bg-brand-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {daySessions.map((s) => (
              <SessionCard key={s.id} session={s} cancelWindowHours={CANCEL_WINDOW_HOURS} />
            ))}
          </div>
        </div>
      ))}

      {sessions.length === 0 && hasPresencial && (
        <p className="text-sm text-brand-muted">No hay sesiones disponibles en los próximos 7 días.</p>
      )}

      {/* E5-07: sin resultados con el filtro puesto — se ofrece quitarlo, no un vacío mudo. */}
      {sessions.length > 0 && filteredSessions.length === 0 && (
        <div className="bg-brand-card border border-dashed border-brand-border rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-brand-muted">No hay sesiones con este filtro.</p>
          <Link
            href="/portal/agenda"
            className="inline-block mt-2 text-[13px] font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink"
          >
            Quitar filtro →
          </Link>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { getTrainerPanelData, formatHoursEs } from "@/lib/trainer-panel-queries";
import { formatDateParam, parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezone } from "@/lib/timezone";
import { addDays } from "@/app/(app)/agenda/agenda-utils";
import { KpiCard, Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingPanel } from "./pending-panel";
import { SessionCountdown } from "./session-countdown";

function greetingForHour(hour: number) {
  if (hour < 14) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

/** Título de la tarjeta de agenda según el día navegado, nunca anterior a hoy. */
function agendaCardTitle(selectedDay: Date, today: Date) {
  const diffDays = Math.round((selectedDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Agenda de hoy";
  if (diffDays === 1) return "Agenda de mañana";
  const label = selectedDay.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `Agenda · ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

const APTITUDE_DOT: Record<string, string> = { GREEN: "#4B5A22", AMBER: "#8A5A12", RED: "#8A3420" };
const ADHERENCE_COLOR = (pct: number) => (pct >= 85 ? "#4B5A22" : pct >= 70 ? "#8A5A12" : "#8A3420");

export default async function TrainerPanelPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const session = await requireRole(["TRAINER"]);
  const [params, center] = await Promise.all([
    searchParams,
    session.user.centerId
      ? prisma.center.findUnique({ where: { id: session.user.centerId }, select: { name: true, timezone: true } })
      : Promise.resolve(null),
  ]);

  // "Sesión en curso" y "faltan X minutos" se calculan con la hora del
  // entrenador, no la del servidor (que corre en UTC). Ver `resolveTimezone`.
  const timezone = await resolveTimezone(center?.timezone);

  const now = zonedNow(timezone);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const requestedDay = params.day ? parseDateParam(params.day) : new Date(today);
  requestedDay.setHours(0, 0, 0, 0);
  // Nunca hacia atrás: un `day` pasado por URL anterior a hoy se acota a hoy.
  const selectedDay = requestedDay < today ? today : requestedDay;

  const data = await getTrainerPanelData(session.user.orgId, session.user.id, session.user.role, timezone, selectedDay);

  const firstName = session.user.name?.split(" ")[0] ?? "Entrenador";
  const dateLabel = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const kicker = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}${center?.name ? ` · ${center.name}` : ""}`;

  const sessionCount = data.todaySessions.length;
  const statusLabel = [
    data.completedCount > 0 ? `${data.completedCount} completada${data.completedCount > 1 ? "s" : ""}` : null,
    data.currentSession ? "1 en curso" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const spotlightKind = data.currentSession ? "current" : data.nextSession ? "next" : "empty";
  const spotlight = data.currentSession ?? data.nextSession ?? null;
  // El anillo mide el día completo (minutos trabajados sobre minutos agendados
  // hoy), no solo la sesión en curso: así hay porcentaje también cuando la
  // próxima sesión aún no ha empezado, que es el caso habitual.
  const dashOffset = Math.round(176 * (1 - data.todayProgressPct / 100));

  const agendaSessionCount = data.agendaSessions.length;
  const agendaRangeLabel = agendaSessionCount
    ? `${data.agendaSessions[0].startTime}–${data.agendaSessions[agendaSessionCount - 1].endTime}`
    : null;
  const canGoPrevDay = selectedDay.getTime() > today.getTime();
  const prevDayHref = `/trainer?day=${formatDateParam(addDays(selectedDay, -1))}`;
  const nextDayHref = `/trainer?day=${formatDateParam(addDays(selectedDay, 1))}`;

  return (
    <div className="tz-page">
      <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
        <div>
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-2 tz-fade-up" style={{ animationDelay: ".05s" }}>
            {kicker}
          </div>
          <h1 className="font-display font-extrabold text-[30px] sm:text-[38px] leading-[1.05] tracking-[-.025em] text-brand-text">
            <span className="inline-block" style={{ animation: "tzRollUp .5s both", animationDelay: ".06s" }}>
              {greetingForHour(now.getHours())},
            </span>{" "}
            <span className="relative inline-block" style={{ animation: "tzRollUp .5s both", animationDelay: ".16s" }}>
              {firstName}.
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(105deg, transparent 40%, rgba(164,128,71,.9) 50%, transparent 60%)",
                  backgroundSize: "220% 100%",
                  backgroundPosition: "-140% 0",
                  animation: "aptaShine 6s ease-in-out 1.8s infinite",
                }}
              >
                {firstName}.
              </span>
            </span>
          </h1>
          <p className="text-[15px] text-brand-text-2 mt-2 max-w-[560px]" style={{ textWrap: "pretty" }}>
            {sessionCount} sesión{sessionCount === 1 ? "" : "es"} hoy ·{" "}
            {data.currentSession ? (
              "tienes una sesión en curso"
            ) : data.nextSession ? (
              <>
                tu próxima es en{" "}
                <SessionCountdown
                  targetIso={data.nextSession.startsAt}
                  initialSeconds={data.nextSession.secondsUntil ?? 0}
                  className="font-bold text-brand-text"
                />
              </>
            ) : (
              "no quedan sesiones hoy"
            )}{" "}
            · {data.pendingDebriefs.length} debriefs, {data.pendingBriefs.length} briefs y{" "}
            {data.pendingClientFeedback.length} feedback mensual pendientes.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/agenda">
            <Button variant="secondary">Ver agenda completa</Button>
          </Link>
          <Link href="/brief">
            <Button variant="primary">Abrir Session Brief</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-5">
        <KpiCard
          label="Horas EP este mes"
          value={`${formatHoursEs(data.epHours)}h`}
          tone="gold"
          delay={0.04}
          footer={
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold ${data.monthDelta >= 0 ? "bg-good-bg text-good" : "bg-critical-bg text-critical"}`}>
                {data.monthDelta >= 0 ? "+" : ""}
                {formatHoursEs(data.monthDelta)}h
              </span>
              <span className="text-[11px] text-brand-muted-2">vs. mes anterior</span>
            </div>
          }
        />
        <KpiCard
          label="Horas de grupos"
          value={`${formatHoursEs(data.groupHours)}h`}
          tone="accent"
          delay={0.1}
          footer={
            <div className="flex items-end gap-[3px] h-[18px] mt-2">
              {data.groupSparkline.map((h, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-[2px] origin-bottom ${
                    i === data.groupSparkline.length - 1 ? "bg-tz-black" : i >= data.groupSparkline.length - 3 ? "bg-tz-linen" : "bg-tz-sand"
                  }`}
                  style={{ height: `${h}%`, animation: "tzRise .4s ease-out both", animationDelay: `${0.5 + i * 0.05}s` }}
                />
              ))}
            </div>
          }
        />
        <KpiCard
          label="Clientes de EP activos"
          value={`${data.epClients.length}`}
          delay={0.16}
          footer={
            <div className="flex items-center gap-2 mt-2">
              {data.epClientsNewThisMonth > 0 && (
                <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold bg-good-bg text-good">
                  {data.epClientsNewThisMonth} nuevos
                </span>
              )}
              <span className="text-[11px] text-brand-muted-2">este mes</span>
            </div>
          }
        />
        <KpiCard
          label="Adherencia de tus clientes"
          value={`${data.adherenceAvg}%`}
          tone="good"
          delay={0.22}
          footer={
            <div className="h-[5px] rounded-full bg-tz-sand overflow-hidden mt-2.5">
              <div className="h-full rounded-full bg-good" style={{ width: `${data.adherenceAvg}%`, animation: "tzProg 1.1s .5s both" }} />
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[1_1_600px] min-w-0 flex flex-col gap-5">
          {/* AGENDA DE HOY */}
          <Card
            title={agendaCardTitle(selectedDay, today)}
            meta={agendaRangeLabel ? `${agendaSessionCount} sesiones · ${agendaRangeLabel}` : undefined}
            delay={0.28}
            action={
              <div className="flex items-center gap-3">
                {data.agendaIsToday && statusLabel && <span className="text-xs font-semibold text-brand-muted">{statusLabel}</span>}
                <div className="flex items-center gap-1">
                  {!data.agendaIsToday && (
                    <Link href="/trainer" className="mr-1 text-xs font-bold uppercase tracking-[.06em] text-brand-muted hover:text-brand-text">
                      Hoy
                    </Link>
                  )}
                  {canGoPrevDay ? (
                    <Link
                      href={prevDayHref}
                      aria-label="Día anterior"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand-border text-brand-text-2 transition-colors hover:bg-brand-bg hover:text-brand-text"
                    >
                      ‹
                    </Link>
                  ) : (
                    <span aria-hidden className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand-border text-brand-text-2 opacity-30">
                      ‹
                    </span>
                  )}
                  <Link
                    href={nextDayHref}
                    aria-label="Día siguiente"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-brand-border text-brand-text-2 transition-colors hover:bg-brand-bg hover:text-brand-text"
                  >
                    ›
                  </Link>
                </div>
              </div>
            }
          >
            {/* Spotlight: solo aplica al día real de hoy, es estado en tiempo real */}
            {!data.agendaIsToday ? null : spotlightKind === "empty" ? (
              <div className="rounded-[14px] bg-brand-ink p-6 mb-[22px] [&_h3]:text-tz-bone [&_p]:text-tz-linen">
                <EmptyState
                  title="Día completado"
                  description={`${data.completedCount} sesión${data.completedCount === 1 ? "" : "es"} realizadas hoy. Buen trabajo.`}
                />
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-[14px] bg-brand-ink p-[20px_22px] mb-[22px] tz-card-sheen">
                <span
                  aria-hidden
                  className="absolute pointer-events-none rounded-full"
                  style={{
                    width: 320,
                    height: 320,
                    right: -80,
                    top: -120,
                    background: "radial-gradient(circle, rgba(200,171,114,.18), transparent 70%)",
                    filter: "blur(70px)",
                    animation: "tzAuroraDrift 26s infinite alternate",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute pointer-events-none rounded-full"
                  style={{
                    width: 260,
                    height: 260,
                    left: "30%",
                    bottom: -140,
                    background: "rgba(216,204,184,.14)",
                    filter: "blur(70px)",
                    animation: "tzAuroraDrift 30s -8s infinite alternate-reverse",
                  }}
                />
                <div className="relative flex gap-6 items-center flex-wrap">
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <svg
                      width="78"
                      height="78"
                      viewBox="0 0 78 78"
                      className="-rotate-90"
                      role="img"
                      aria-label={`${data.todayProgressPct}% de los minutos de hoy trabajados`}
                    >
                      <circle cx="39" cy="39" r="28" fill="none" stroke="rgba(244,240,232,.16)" strokeWidth="5" />
                      <circle
                        cx="39"
                        cy="39"
                        r="28"
                        fill="none"
                        stroke="#C8AB72"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={176}
                        strokeDashoffset={dashOffset}
                        style={{ animation: "tzDash 1.4s .6s both" }}
                      />
                      <text x="39" y="39" textAnchor="middle" dominantBaseline="central" fill="#F4F0E8" fontSize="15" fontWeight="800" transform="rotate(90 39 39)">
                        {data.todayProgressPct}%
                      </text>
                    </svg>
                    <span className="text-[10px] font-bold tabular-nums tracking-[.04em]" style={{ color: "#A8A296" }}>
                      {data.todayMinutesWorked}/{data.todayMinutesTotal} min
                    </span>
                  </div>

                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="relative inline-flex items-center gap-1.5 rounded-pill px-[11px] py-[5px] text-[10px] font-extrabold tracking-[.08em] uppercase" style={{ background: "rgba(200,171,114,.16)", color: "#E3CFA2" }}>
                        <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: "#C8AB72" }}>
                          {spotlightKind === "current" && (
                            <span className="absolute inset-0 rounded-full border" style={{ borderColor: "#C8AB72", animation: "tzPulseRing 2.4s ease-out infinite" }} />
                          )}
                        </span>
                        {spotlightKind === "current" ? "En curso" : "Próxima"}
                      </span>
                      {spotlight && (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#A8A296" }}>
                          {spotlightKind === "current" ? "quedan" : "empieza en"}
                          <SessionCountdown
                            targetIso={spotlightKind === "current" ? spotlight.endsAt : spotlight.startsAt}
                            initialSeconds={(spotlightKind === "current" ? spotlight.secondsRemaining : spotlight.secondsUntil) ?? 0}
                            className="font-bold"
                          />
                        </span>
                      )}
                    </div>
                    <div className="font-display font-extrabold text-[22px] tracking-[-.015em] mt-2" style={{ color: "#F4F0E8" }}>
                      {spotlight?.startTime}–{spotlight?.endTime} · {spotlight?.title}
                    </div>
                    <div className="text-sm mt-1" style={{ color: "#D8CCB8" }}>
                      {spotlight?.meta}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[168px]">
                    {spotlightKind === "current" ? (
                      <>
                        <Link
                          href={`/agenda/session/${spotlight?.id}`}
                          className="text-center font-bold text-sm rounded-[10px] px-4 py-2.5 transition-transform duration-200 hover:-translate-y-[2px]"
                          style={{ background: "#F4F0E8", color: "#1D1D1C" }}
                        >
                          Cerrar debrief
                        </Link>
                        {spotlight?.soloMemberId && (
                          <Link
                            href={`/members/${spotlight.soloMemberId}`}
                            className="text-center font-semibold text-sm rounded-[10px] px-4 py-2.5 border transition-colors duration-200"
                            style={{ borderColor: "rgba(216,204,184,.35)", color: "#D8CCB8" }}
                          >
                            Ver ficha del socio
                          </Link>
                        )}
                      </>
                    ) : (
                      <Link
                        href={`/brief/${spotlight?.id}`}
                        className="text-center font-bold text-sm rounded-[10px] px-4 py-2.5 transition-transform duration-200 hover:-translate-y-[2px]"
                        style={{ background: "#F4F0E8", color: "#1D1D1C" }}
                      >
                        Abrir Session Brief
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {data.agendaSessions.length === 0 ? (
              data.agendaIsToday ? null : (
                <EmptyState title="Sin sesiones" description="No tienes sesiones programadas ese día." />
              )
            ) : (
              // El timeline crece con las sesiones del día: se acota para que la
              // tarjeta no empuje el resto del panel y se navega con scroll propio.
              <div className="max-h-[420px] overflow-y-auto -mr-1.5 pr-1.5">
                <div className="relative pl-[26px]">
                  <span className="absolute left-[5px] top-[6px] bottom-[6px] w-[2px] rounded-full bg-gradient-to-b from-tz-linen to-tz-sand" />
                  <div className="flex flex-col">
                  {data.agendaSessions.map((s, i) => (
                    <Link
                      key={s.id}
                      href={s.status === "past" ? `/agenda/session/${s.id}` : `/brief/${s.id}`}
                      className={`relative grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-4 p-[13px_14px] rounded-xl transition-[transform,background-color] duration-200 hover:translate-x-[3px] hover:bg-brand-bg tz-fade-up ${
                        s.status === "current" ? "bg-brand-bg" : s.status === "past" ? "opacity-60 hover:opacity-100" : ""
                      }`}
                      style={{ animationDelay: `${0.34 + i * 0.04}s` }}
                    >
                      <span
                        className="absolute left-[-26px] top-1/2 -mt-[5px] w-3 h-3 rounded-full border-[3px] border-white"
                        style={{ background: s.status === "current" ? "#C8AB72" : s.status === "past" ? "#5B5748" : "#D8CCB8" }}
                      />
                      <div>
                        <div className="text-[13px] font-bold tabular-nums text-brand-text-2">{s.startTime}</div>
                        <div className="text-[11px] text-brand-muted-2">{s.durationMin} min</div>
                      </div>
                      <div className="min-w-0">
                        <div className={`text-[15px] font-bold text-brand-text truncate ${s.status === "current" ? "font-extrabold" : ""}`}>{s.title}</div>
                        <div className="text-xs text-brand-muted truncate">{s.meta}</div>
                      </div>
                      <Badge tone={s.chipTone}>{s.chipLabel}</Badge>
                    </Link>
                  ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* MIS CLIENTES DE EP */}
          <Card
            title="Mis clientes de EP"
            meta={`${data.epClients.length} activos`}
            delay={0.34}
            action={
              <Link href="/members?trainer=me" className="text-xs font-bold uppercase tracking-[.06em] text-brand-muted hover:text-brand-text">
                Ver todos
              </Link>
            }
          >
            {data.epClients.length === 0 ? (
              <EmptyState title="Sin clientes de EP" description="Todavía no tienes clientes de Personal Training asignados." />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[540px]">
                  <div
                    className="grid gap-3 text-[11px] font-bold uppercase tracking-[.06em] text-brand-muted-2 pb-2"
                    style={{ gridTemplateColumns: "minmax(170px,1.7fr) minmax(96px,.9fr) 68px minmax(90px,.85fr) minmax(76px,.7fr)" }}
                  >
                    <span>Cliente</span>
                    <span>Servicio</span>
                    <span className="text-right">Sesiones</span>
                    <span>Adherencia</span>
                    <span className="text-right">Próxima</span>
                  </div>
                  {data.epClients.map((c) => (
                    <Link
                      key={c.id}
                      href={`/members/${c.id}`}
                      className="grid gap-3 items-center border-t border-tz-sand p-3 rounded-[10px] transition-[transform,background-color] duration-200 hover:bg-brand-bg hover:translate-x-[3px]"
                      style={{ gridTemplateColumns: "minmax(170px,1.7fr) minmax(96px,.9fr) 68px minmax(90px,.85fr) minmax(76px,.7fr)" }}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="relative shrink-0">
                          <span className="w-[34px] h-[34px] rounded-full bg-tz-sand text-brand-text-2 flex items-center justify-center text-xs font-extrabold">
                            {initials(c.firstName, c.lastName)}
                          </span>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] rounded-full border-2 border-white"
                            style={{ background: APTITUDE_DOT[c.light ?? "GREEN"] }}
                          />
                        </span>
                        <span className="min-w-0">
                          <div className="text-sm font-bold text-brand-text truncate">
                            {c.firstName} {c.lastName}
                          </div>
                          {c.note && <div className="text-[11px] text-brand-muted-2 truncate">{c.note}</div>}
                        </span>
                      </span>
                      <span className="text-xs text-brand-text-2 truncate">{c.planNames || "—"}</span>
                      <span className="text-sm font-bold tabular-nums text-right">{c.attendedCount}</span>
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-[5px] rounded-full bg-tz-sand overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${c.adherencePct}%`, background: ADHERENCE_COLOR(c.adherencePct) }} />
                        </span>
                        <span className="text-[11px] font-bold tabular-nums w-[30px] text-right">{c.adherencePct}%</span>
                      </span>
                      <span className="text-xs text-brand-text-2 text-right whitespace-nowrap">{c.nextLabel}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="flex-[1_1_300px] min-w-0 max-w-[420px] flex flex-col gap-5">
          {/* PENDIENTES */}
          <Card
            title="Pendientes"
            meta={`${data.pendingDebriefs.length + data.pendingBriefs.length + data.pendingClientFeedback.length + data.aptitudeAlerts.length} acciones`}
            delay={0.4}
          >
            <PendingPanel
              debriefs={data.pendingDebriefs}
              briefs={data.pendingBriefs}
              feedback={data.pendingClientFeedback}
              aptitude={data.aptitudeAlerts}
            />
          </Card>

          {/* HUECOS DE EP */}
          <Card
            title="Huecos de EP"
            delay={0.46}
            action={<span className="text-xs font-semibold text-brand-muted">{data.epSlotsPublished} publicados</span>}
          >
            <p className="text-xs text-brand-muted -mt-3 mb-4">
              Franjas autorreservables de esta semana · {data.epSlotsReserved} ya reservadas.
            </p>
            <div className="grid grid-cols-7 gap-1.5 items-end h-24">
              {data.epSlots.map((d, i) => (
                <div key={d.dayLabel + i} className="flex flex-col justify-end gap-1 h-full">
                  {d.reservedCount + d.freeCount === 0 ? (
                    <span
                      className="rounded-md bg-[#efece3] origin-bottom"
                      style={{ height: "8%", animation: "tzRise .55s both", animationDelay: `${0.5 + i * 0.04}s` }}
                    />
                  ) : (
                    <>
                      {d.freeCount > 0 && (
                        <span
                          className="rounded-md origin-bottom"
                          style={{ height: `${d.freePct}%`, background: d.isToday ? "#C8AB72" : "#E7DFD2", animation: "tzRise .55s both", animationDelay: `${0.5 + i * 0.04}s` }}
                        />
                      )}
                      {d.reservedCount > 0 && (
                        <span
                          className="rounded-md bg-tz-black origin-bottom"
                          style={{ height: `${d.reservedPct}%`, animation: "tzRise .55s both", animationDelay: `${0.5 + i * 0.04}s` }}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 mt-2 mb-4">
              {data.epSlots.map((d, i) => (
                <span key={i} className={`text-center text-[11px] font-bold ${d.isToday ? "text-brand-text" : "text-brand-muted-2"}`}>
                  {d.dayLabel}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-brand-muted mb-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-[9px] h-[9px] rounded-[3px] bg-tz-black" /> Reservado
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-[9px] h-[9px] rounded-[3px] bg-tz-sand" /> Libre
              </span>
            </div>
            <Link href="/agenda">
              <Button variant="secondary" className="w-full">
                Publicar nueva franja
              </Button>
            </Link>
          </Card>

          {/* Reconocimiento */}
          <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-tz-sand p-[22px] tz-fade-up" style={{ animationDelay: ".52s" }}>
            <span
              aria-hidden
              className="absolute pointer-events-none rounded-full"
              style={{ width: 200, height: 200, right: -40, bottom: -60, background: "radial-gradient(circle, rgba(200,171,114,.3), transparent 70%)", filter: "blur(30px)", animation: "tzFloat 11s ease-in-out infinite" }}
            />
            <div className="relative">
              <div className="font-display font-bold text-[10px] tracking-[.16em] uppercase mb-2" style={{ color: "#8A6D2F" }}>
                Reconocimiento del mes
              </div>
              <p className="text-[15px] font-semibold text-brand-text leading-[1.45]">
                Tus clientes de EP mantienen un <strong>{data.adherenceAvg}% de adherencia</strong>
                {data.adherenceAvg > data.orgAdherencePct
                  ? `, ${data.adherenceAvg - data.orgAdherencePct} puntos por encima de la media del centro.`
                  : "."}
              </p>
              <div className="flex items-center gap-2.5 mt-4">
                <span className="w-[26px] h-[26px] rounded-full bg-tz-black text-tz-bone flex items-center justify-center text-[11px] font-extrabold shrink-0">
                  {initials(firstName, session.user.name?.split(" ").slice(-1)[0] ?? "")}
                </span>
                <span className="text-xs text-brand-text-2">Media de tus clientes de EP en los últimos 90 días.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

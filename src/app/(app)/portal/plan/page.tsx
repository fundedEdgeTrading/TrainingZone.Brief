import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import {
  getMemberForUser,
  getMemberGoals,
  getPendingSessionFeedback,
  getMemberRatingSummary,
  getMemberPlanAdherence,
} from "@/lib/portal-queries";
import { listWorkoutPrograms } from "@/lib/workout-programs";
import { Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { RequestWorkoutButton } from "./plan-client";
import { PendingSessionsRating } from "./pending-sessions";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Por confirmar", PENDING_TRAINER: "Por confirmar", ACTIVE: "Activa", COMPLETED: "Completada" };

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// "Ayer · 21 jul" / "Hoy · 22 jul" / "Mar · 23 jul" — coherente con las fechas
// formateadas server-side del resto del portal (evita desajustes de hidratación).
function relativeDayLabel(date: Date) {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  const dayMonth = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  if (diffDays === 0) return `Hoy · ${dayMonth}`;
  if (diffDays === 1) return `Ayer · ${dayMonth}`;
  const weekday = date.toLocaleDateString("es-ES", { weekday: "short" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${dayMonth}`;
}

export default async function PortalPlanPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const [goals, programs, pending, ratings, adherence] = await Promise.all([
    getMemberGoals(member.id),
    listWorkoutPrograms(session.user.orgId, member.id),
    getPendingSessionFeedback(member.id),
    getMemberRatingSummary(member.id),
    getMemberPlanAdherence(member.id),
  ]);

  const hasPendingProgram = programs.some((p) => p.status === "DRAFT" || p.status === "PENDING_TRAINER");
  const activeSub = member.subscriptions[0];
  const activeGoals = goals.filter((g) => !g.achievedAt);
  const trainerName = member.trainer?.name ?? null;
  const planTitle = activeGoals.slice(0, 2).map((g) => g.label).join(" · ") || "Tu programa de entrenamiento";

  const pendingItems = pending.map((p) => {
    const dateLabel = relativeDayLabel(p.sessionDate);
    return {
      bookingId: p.bookingId,
      sessionName: p.sessionName,
      dateLabel,
      time: p.time,
      focus: p.focus,
      trainerName: p.trainerName,
      meta: `${dateLabel} · ${p.time}${p.trainerName ? ` · ${p.trainerName}` : ""}`,
    };
  });

  return (
    <div className="max-w-[1120px] mx-auto flex flex-col gap-5">
      {/* Hero del plan */}
      <div className="relative overflow-hidden bg-brand-ink border border-brand-border-dark rounded-[22px] p-6 sm:px-9 sm:py-8 grid grid-cols-1 md:grid-cols-[1.45fr_1fr] gap-7 tz-fade-up">
        <div
          className="absolute -right-[90px] -top-[90px] w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at 30% 30%, rgba(200,171,114,.22), transparent 70%)" }}
        />
        <div className="relative z-10 flex flex-col justify-between gap-[22px]">
          <div>
            <div className="inline-flex items-center gap-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-apta-gold">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "linear-gradient(135deg,#e3cfa2,#b58e52)" }} />
              Tu plan{activeSub ? ` · ${activeSub.plan.name}` : ""}
            </div>
            <div className="font-display font-extrabold text-[28px] sm:text-[34px] leading-[1.05] text-white mt-3.5 uppercase tracking-[-.01em]">
              {planTitle}
            </div>
            <p className="text-sm text-brand-muted-2 mt-3.5 max-w-[440px] leading-[1.55]">
              {trainerName ? (
                <>
                  Programa personalizado de <b className="text-tz-bone">{trainerName}</b>.{" "}
                </>
              ) : (
                "Aún no tienes un entrenador asignado. "
              )}
              {adherence.avgPerWeek > 0
                ? `${adherence.avgPerWeek} ${adherence.avgPerWeek === 1 ? "sesión" : "sesiones"} por semana con foco en tu progreso.`
                : "Reserva tus próximas sesiones para ver aquí tu progreso."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {trainerName && (
              <span className="inline-flex items-center gap-1.5 bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                <span className="w-6 h-6 rounded-full bg-good flex items-center justify-center text-[11px] font-extrabold text-white shrink-0">
                  {initials(trainerName)}
                </span>
                {trainerName}
              </span>
            )}
            {adherence.avgPerWeek > 0 && (
              <span className="bg-brand-ink-soft rounded-full px-3.5 py-[7px] text-[12.5px] font-semibold text-tz-bone">
                {adherence.avgPerWeek} {adherence.avgPerWeek === 1 ? "día" : "días"} / semana
              </span>
            )}
          </div>
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          <div className="bg-white/[.06] border border-white/[.16] rounded-2xl px-5 py-[18px]">
            <div className="text-[11px] font-bold tracking-[.1em] uppercase text-brand-muted">Adherencia al plan</div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-display font-extrabold text-[40px] leading-none text-white tabular-nums">
                {adherence.pct ?? "—"}
              </span>
              {adherence.pct != null && <span className="text-base font-bold text-brand-muted-2">%</span>}
            </div>
            <div className="h-1.5 rounded-full bg-white/[.14] overflow-hidden mt-3">
              <div
                className="h-full rounded-full origin-left [animation:tzGrow_.8s_ease-out_both]"
                style={{ width: `${adherence.pct ?? 0}%`, background: "linear-gradient(90deg,#4b5a22,#c8ab72)" }}
              />
            </div>
            <div className="text-xs text-brand-muted mt-2">
              {adherence.committed > 0
                ? `${adherence.attended} de ${adherence.committed} sesiones planificadas`
                : "Sin sesiones registradas en las últimas 4 semanas"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[.06] border border-white/[.16] rounded-2xl px-4 py-3.5">
              <div className="text-[10px] font-bold tracking-[.1em] uppercase text-brand-muted">Semana</div>
              <div className="font-display font-extrabold text-2xl text-white mt-1.5 tabular-nums">
                {adherence.weekAttended}
                <span className="text-sm text-brand-muted-2"> / {adherence.weekCommitted}</span>
              </div>
            </div>
            <div className="bg-white/[.06] border border-white/[.16] rounded-2xl px-4 py-3.5">
              <div className="text-[10px] font-bold tracking-[.1em] uppercase text-brand-muted">Racha</div>
              <div className="font-display font-extrabold text-2xl text-white mt-1.5 tabular-nums">
                {adherence.streakWeeks}
                <span className="text-sm text-brand-muted-2"> {adherence.streakWeeks === 1 ? "semana" : "semanas"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Valora tus sesiones */}
      <PendingSessionsRating pending={pendingItems} />

      {/* Medias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 tz-fade-up" style={{ animationDelay: "0.12s" }}>
        <div className="bg-brand-card border border-brand-border rounded-2xl p-[22px]">
          <div className="text-[11px] font-bold tracking-[.1em] uppercase text-brand-muted">
            Tu valoración media · entrenadores
          </div>
          <div className="flex items-baseline gap-1.5 mt-2.5">
            <span className="font-display font-extrabold text-4xl text-brand-text tabular-nums">
              {ratings.trainerAvg != null ? ratings.trainerAvg.toFixed(1) : "—"}
            </span>
            <span className="text-base font-bold text-brand-muted-2">/ 10</span>
          </div>
          <div className="text-[12.5px] text-brand-muted mt-2">
            {ratings.trainerCount > 0 ? `sobre ${ratings.trainerCount} sesiones valoradas` : "aún sin valoraciones"}
          </div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-2xl p-[22px]">
          <div className="text-[11px] font-bold tracking-[.1em] uppercase text-brand-muted">Tu autoevaluación media</div>
          <div className="flex items-baseline gap-1.5 mt-2.5">
            <span className="font-display font-extrabold text-4xl text-good tabular-nums">
              {ratings.selfAvg != null ? ratings.selfAvg.toFixed(1) : "—"}
            </span>
            <span className="text-base font-bold text-brand-muted-2">/ 10</span>
          </div>
          <div className="text-[12.5px] text-brand-muted mt-2">energía y esfuerzo percibido</div>
        </div>
      </div>

      <Card title="Tus objetivos" meta={`${goals.length} activos`}>
        {goals.length === 0 ? (
          <p className="text-sm text-brand-muted">Tu entrenador aún no te ha asignado objetivos concretos.</p>
        ) : (
          <ul className="space-y-2">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center justify-between border-t border-tz-sand pt-2 first:border-0 first:pt-0 text-sm">
                <span className={g.achievedAt ? "line-through text-brand-muted" : "text-brand-text"}>{g.label}</span>
                {g.achievedAt && <Badge tone="good">Conseguido</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Tu rutina para casa" meta="generada con ayuda de IA, confirmada por tu entrenador">
        <div className="space-y-3">
          <RequestWorkoutButton hasPending={hasPendingProgram} />
          {programs.length === 0 ? (
            <p className="text-sm text-brand-muted">Todavía no has solicitado ninguna rutina.</p>
          ) : (
            <ul className="space-y-2">
              {programs.map((p) => (
                <li key={p.id} className="border border-brand-border rounded-lg p-3 text-sm flex items-center justify-between">
                  <span className="text-brand-text-2">{p.createdAt.toLocaleDateString("es-ES")}</span>
                  <Badge tone={p.status === "ACTIVE" ? "good" : "neutral"}>{STATUS_LABEL[p.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getWeeklyDebriefReport, getWeeklyClientFeedback } from "@/lib/brief-queries";
import { getTrainerRatingSummary } from "@/lib/trainer-rating-access";
import { startOfWeekMonday, formatDateParam, parseDateParam } from "@/lib/date-utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";

const FEELING_ICON = { green: "🟢", yellow: "🟡", red: "🔴" } as const;

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ trainerId?: string; week?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  const orgId = session.user.orgId;
  const params = await searchParams;

  const weekStart = params.week ? parseDateParam(params.week) : startOfWeekMonday(new Date());
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const prevWeek = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [weeklyReport, ratingSummary, clientFeedback] = await Promise.all([
    getWeeklyDebriefReport(orgId, weekStart),
    getTrainerRatingSummary(orgId, session.user.role),
    getWeeklyClientFeedback(orgId, weekStart),
  ]);

  const trainers = (ratingSummary ?? []).map((r) => ({ trainerId: r.trainerUserId, trainerName: r.name }));
  // Entrenadores con debrief esta semana pero sin fila en TrainerRating (aún sin valoraciones) también deben aparecer.
  for (const t of weeklyReport) {
    if (!trainers.some((x) => x.trainerId === t.trainerId)) trainers.push({ trainerId: t.trainerId, trainerName: t.trainerName });
  }
  trainers.sort((a, b) => a.trainerName.localeCompare(b.trainerName));

  const selectedTrainerId = params.trainerId || "";
  const visibleTrainers = selectedTrainerId ? trainers.filter((t) => t.trainerId === selectedTrainerId) : trainers;

  const allSessions = weeklyReport.flatMap((t) => t.sessions.map((s) => ({ ...s, trainerName: t.trainerName, trainerId: t.trainerId })));

  const weekLink = (opts: { trainerId?: string; week?: Date }) => {
    const qs = new URLSearchParams();
    const tId = opts.trainerId !== undefined ? opts.trainerId : selectedTrainerId;
    if (tId) qs.set("trainerId", tId);
    qs.set("week", formatDateParam(opts.week ?? weekStart));
    return `/feedback?${qs.toString()}`;
  };

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        description="Reporte semanal de Debriefs de sesión (RB-FB-101/103/104) junto a la valoración confidencial de entrenadores. La valoración solo la ve dirección — nunca el propio entrenador."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Link href={weekLink({ week: prevWeek })} className="px-2 py-1 rounded-md text-muted hover:bg-tz-sand transition-colors duration-150">
              ← semana anterior
            </Link>
            <span className="font-semibold text-tz-black tz-nums">
              {weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – {weekEnd.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </span>
            <Link href={weekLink({ week: nextWeek })} className="px-2 py-1 rounded-md text-muted hover:bg-tz-sand transition-colors duration-150">
              semana siguiente →
            </Link>
          </div>
        }
      />

      {trainers.length > 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          <Link
            href={weekLink({ trainerId: "" })}
            className={`px-2.5 py-1 rounded-md transition-colors duration-150 ${!selectedTrainerId ? "bg-tz-sand text-tz-black font-semibold" : "text-muted hover:bg-tz-sand"}`}
          >
            Todos
          </Link>
          {trainers.map((t) => (
            <Link
              key={t.trainerId}
              href={weekLink({ trainerId: t.trainerId })}
              className={`px-2.5 py-1 rounded-md transition-colors duration-150 ${selectedTrainerId === t.trainerId ? "bg-tz-sand text-tz-black font-semibold" : "text-muted hover:bg-tz-sand"}`}
            >
              {t.trainerName}
            </Link>
          ))}
        </div>
      )}

      <Card title="Reporte semanal de Debriefs" meta={`${allSessions.length} sesiones con debriefs`} delay={0.04}>
        {allSessions.length === 0 ? (
          <EmptyState title="Sin debriefs esta semana" description="No se han registrado Debriefs de sesión en el rango seleccionado." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-faint text-left">
              <tr>
                <th className="pb-2">Sesión</th>
                <th className="pb-2">Entrenador</th>
                <th className="pb-2">Fecha</th>
                <th className="pb-2">🟢</th>
                <th className="pb-2">🟡</th>
                <th className="pb-2">🔴</th>
                <th className="pb-2">Notas</th>
                <th className="pb-2">Feedback cliente (post-sesión)</th>
              </tr>
            </thead>
            <tbody>
              {(selectedTrainerId ? allSessions.filter((s) => s.trainerId === selectedTrainerId) : allSessions).map((s) => {
                const feedback = clientFeedback.get(s.sessionId) ?? [];
                return (
                  <tr key={s.sessionId} className="border-t border-tz-sand align-top">
                    <td className="py-2">{s.sessionName}</td>
                    <td className="py-2 text-text-2">{s.trainerName}</td>
                    <td className="py-2 tz-nums text-text-2">{s.sessionDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}</td>
                    <td className="py-2 tz-nums">{s.greenCount || ""}</td>
                    <td className="py-2 tz-nums">{s.yellowCount || ""}</td>
                    <td className="py-2 tz-nums">{s.redCount || ""}</td>
                    <td className="py-2 text-xs text-muted max-w-[280px]">
                      {s.notes.length === 0 ? "—" : s.notes.join(" · ")}
                    </td>
                    <td className="py-2 text-xs text-muted max-w-[240px]">
                      {feedback.length === 0
                        ? "—"
                        : feedback
                            .map((f) => `${FEELING_ICON[f.feeling.toLowerCase() as keyof typeof FEELING_ICON] ?? ""}${f.rpe ? ` RPE ${f.rpe}` : ""}${f.comment ? ` · ${f.comment}` : ""}`)
                            .join(" / ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {visibleTrainers.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card">
          <EmptyState title="Sin entrenadores" description="No hay entrenadores dados de alta todavía." />
        </div>
      ) : (
        <div className="space-y-4">
          {visibleTrainers.map((t) => {
            const trainerSessions = weeklyReport.find((w) => w.trainerId === t.trainerId)?.sessions ?? [];
            const rating = ratingSummary?.find((r) => r.trainerUserId === t.trainerId);
            return (
              <div key={t.trainerId} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title={t.trainerName} meta="Debriefs de sesión (cliente)" delay={0.06}>
                  {trainerSessions.length === 0 ? (
                    <p className="text-sm text-brand-muted">Sin debriefs esta semana.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {trainerSessions.map((s) => {
                        const feedback = clientFeedback.get(s.sessionId) ?? [];
                        return (
                          <li key={s.sessionId} className="text-sm border-b border-tz-sand last:border-0 pb-2 last:pb-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-brand-text">{s.sessionName}</span>
                              <span className="text-xs text-faint tz-nums">{s.sessionDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5">
                              Debrief: {FEELING_ICON.green} {s.greenCount} · {FEELING_ICON.yellow} {s.yellowCount} · {FEELING_ICON.red} {s.redCount}
                            </div>
                            {s.notes.length > 0 && <div className="text-xs text-brand-muted-2 mt-1">{s.notes.join(" · ")}</div>}
                            {feedback.length > 0 && (
                              <div className="text-xs text-brand-muted-2 mt-1">
                                Feedback cliente:{" "}
                                {feedback
                                  .map(
                                    (f) =>
                                      `${FEELING_ICON[f.feeling.toLowerCase() as keyof typeof FEELING_ICON] ?? ""}${f.rpe ? ` RPE ${f.rpe}` : ""}${f.comment ? ` · ${f.comment}` : ""}`
                                  )
                                  .join(" / ")}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>

                <Card title={t.trainerName} meta="Valoración del entrenador (confidencial)" delay={0.1}>
                  {!rating || rating.count === 0 ? (
                    <p className="text-sm text-brand-muted">Sin valoraciones registradas todavía.</p>
                  ) : (
                    <div className="flex items-baseline gap-3">
                      <div className="font-display font-extrabold text-3xl text-brand-text tz-nums">
                        {rating.avgScore?.toFixed(1) ?? "—"}
                      </div>
                      <div className="text-sm text-brand-muted">
                        media sobre {rating.count} valoración{rating.count === 1 ? "" : "es"} de socios
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { requireRole } from "@/lib/guard";
import { canReviewStaffProposals, canViewTrainerRatings, canManageOrg } from "@/lib/rbac";
import { listMyTimeClockEntries, listAllTimeClockEntries, crossCheckHours } from "@/lib/timeclock-queries";
import { listStaffProposals } from "@/lib/staff-proposals";
import { getTrainerRatingSummary } from "@/lib/trainer-rating-access";
import { getCheckinConfigs } from "@/lib/checkin-schedule";
import { Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { TimeClockWidget, ProposalForm, ProposalReviewList, CheckinConfigForm } from "./rrhh-client";

function fmtHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

export default async function RrhhPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION", "HR_MANAGER"]);
  const isReviewer = canReviewStaffProposals(session.user.role);
  const isDirection = canManageOrg(session.user.role) || session.user.role === "CENTER_DIRECTOR";

  const myEntries = await listMyTimeClockEntries(session.user.orgId, session.user.id, 14);
  const todayEntry = myEntries.find((e) => e.workDate.toDateString() === new Date().toDateString()) ?? null;

  const [proposals, crossCheck, ratingSummary, checkinConfigs] = await Promise.all([
    isReviewer ? listStaffProposals(session.user.orgId) : Promise.resolve([]),
    isReviewer ? crossCheckHours(session.user.orgId) : Promise.resolve([]),
    canViewTrainerRatings(session.user.role) ? getTrainerRatingSummary(session.user.orgId, session.user.role) : Promise.resolve(null),
    isDirection ? getCheckinConfigs(session.user.orgId) : Promise.resolve([]),
  ]);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Fichaje, buzón de propuestas y herramientas de dirección de equipo." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Mi fichaje" meta="RB-RRHH-001">
          <TimeClockWidget todayEntry={todayEntry} recent={myEntries} />
        </Card>

        <Card title="Buzón de propuestas" meta="RB-RRHH-003">
          <div className="space-y-4">
            <ProposalForm />
            {isReviewer && <ProposalReviewList proposals={proposals} />}
          </div>
        </Card>
      </div>

      {isReviewer && (
        <Card title="Verificación cruzada de horas" meta="RB-RRHH-002 — informativo, no bloquea nómina">
          {crossCheck.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin fichajes con salida registrada en los últimos 14 días.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th className="pb-2">Trabajador</th>
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Fichado</th>
                  <th className="pb-2">Dirigido</th>
                  <th className="pb-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {crossCheck.map((row, i) => (
                  <tr key={i} className="border-t border-tz-sand">
                    <td className="py-2">{row.userName}</td>
                    <td className="py-2">{row.workDate.toLocaleDateString("es-ES")}</td>
                    <td className="py-2 tz-nums">{fmtHours(row.clockedMinutes)}</td>
                    <td className="py-2 tz-nums">{fmtHours(row.directedMinutes)}</td>
                    <td className={`py-2 tz-nums ${Math.abs(row.diffMinutes) > 30 ? "text-critical" : "text-brand-muted"}`}>
                      {row.diffMinutes >= 0 ? "+" : ""}
                      {fmtHours(row.diffMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {ratingSummary && (
        <Card title="Valoración de entrenadores" meta="RB-RRHH-011/012 — exclusivo dirección">
          <table className="w-full text-sm">
            <thead className="text-xs text-faint text-left">
              <tr>
                <th className="pb-2">Entrenador</th>
                <th className="pb-2">Media</th>
                <th className="pb-2">Valoraciones</th>
              </tr>
            </thead>
            <tbody>
              {ratingSummary.map((r) => (
                <tr key={r.trainerUserId} className="border-t border-tz-sand">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 tz-nums">{r.avgScore ? r.avgScore.toFixed(1) : "—"}</td>
                  <td className="py-2 tz-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isDirection && checkinConfigs.length > 0 && (
        <Card title="Periodicidad de check-ins" meta="RB-IA-006 / RB-RRHH-011 — configurable sin desplegar">
          <div className="space-y-3">
            {checkinConfigs.map((c) => (
              <CheckinConfigForm key={c.serviceKind} config={c} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

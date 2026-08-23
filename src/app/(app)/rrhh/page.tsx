import { requireRole } from "@/lib/guard";
import { canViewTrainerRatings, canManageOrg } from "@/lib/rbac";
import { getTrainerRatingSummary } from "@/lib/trainer-rating-access";
import { getSalesRanking, currentMonthRange } from "@/lib/sales-ranking";
import { getCheckinConfigs } from "@/lib/checkin-schedule";
import { Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { CheckinConfigForm } from "./rrhh-client";

function fmtEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default async function RrhhPage() {
  // Entrenadores y recepción entraban aquí solo por el buzón de propuestas.
  // Retirado el buzón, lo que queda es material de dirección: el guard se ciñe
  // a los mismos roles que ven la entrada en el nav.
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "HR_MANAGER"]);
  const isDirection = canManageOrg(session.user.role) || session.user.role === "CENTER_DIRECTOR";

  const monthRange = currentMonthRange();
  const [ratingSummary, checkinConfigs, salesRanking] = await Promise.all([
    canViewTrainerRatings(session.user.role) ? getTrainerRatingSummary(session.user.orgId, session.user.role) : Promise.resolve(null),
    isDirection ? getCheckinConfigs(session.user.orgId) : Promise.resolve([]),
    isDirection ? getSalesRanking(session.user.orgId, monthRange) : Promise.resolve([]),
  ]);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Herramientas de dirección de equipo." />

      {ratingSummary && (
        <Card title="Valoración de entrenadores" meta="RB-RRHH-011/012 — exclusivo dirección">
          <div className="overflow-x-auto">
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
          </div>
        </Card>
      )}

      {isDirection && (
        <Card title="Ranking de ventas" meta={`RB-RRHH-004 — ${monthRange.label}`}>
          {salesRanking.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin cobros atribuidos a ningún trabajador este mes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-faint text-left">
                  <tr>
                    <th className="pb-2">Trabajador</th>
                    <th className="pb-2">Rol</th>
                    <th className="pb-2">Ventas</th>
                    <th className="pb-2">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRanking.map((r, i) => (
                    <tr key={r.userId} className="border-t border-tz-sand">
                      <td className="py-2 font-semibold">
                        {i === 0 && "🥇 "}
                        {i === 1 && "🥈 "}
                        {i === 2 && "🥉 "}
                        {r.name}
                      </td>
                      <td className="py-2 text-brand-muted">{r.role}</td>
                      <td className="py-2 tz-nums">{r.salesCount}</td>
                      <td className="py-2 tz-nums font-semibold">{fmtEuros(r.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

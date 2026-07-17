import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, getMemberProgress, getMemberHealthTransparency } from "@/lib/portal-queries";
import { KpiCard, Card } from "@/components/kpi-card";

const LIGHT_EMOJI: Record<string, string> = { RED: "🔴", AMBER: "🟡", GREEN: "🟢" };

export default async function PortalHomePage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const [progress, adaptations] = await Promise.all([
    getMemberProgress(member.id),
    getMemberHealthTransparency(member.id, session.user.orgId),
  ]);

  const activeSub = member.subscriptions[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Hola, {member.firstName} 👋
          </h1>
          <p className="text-sm text-slate-500">{member.primaryCenter?.name}</p>
        </div>
        <Link
          href="/portal/agenda"
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
        >
          Reservar clase →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Sesiones este mes" value={String(progress.totalThisMonth)} />
        <KpiCard label="Sesiones este año" value={String(progress.totalThisYear)} tone="good" />
        <KpiCard label="Total histórico" value={String(progress.totalAllTime)} hint="¡sigue así!" />
        <KpiCard
          label="Tu mejor mes"
          value={progress.bestMonthCount ? String(progress.bestMonthCount) : "—"}
          hint={progress.bestMonthLabel || undefined}
        />
      </div>

      {activeSub && (
        <Card title="Tu plan">
          <p className="text-sm text-slate-700">
            {activeSub.plan.name} — activo desde {activeSub.startDate.toLocaleDateString("es-ES")}
          </p>
        </Card>
      )}

      <Card title="Transparencia: lo que está adaptando tu entrenador">
        {adaptations.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tienes ninguna condición de salud activa registrada ahora mismo.
          </p>
        ) : (
          <div className="space-y-2">
            {adaptations.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-lg">{LIGHT_EMOJI[a.light]}</span>
                <div>
                  <span className="font-medium text-slate-800">{a.blockArea}</span>
                  {a.adaptation && <span className="text-slate-500"> — {a.adaptation}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Estas adaptaciones las define tu entrenador a partir de la información
          de salud que has consentido compartir. Puedes solicitar el detalle
          completo o revocar el consentimiento en cualquier momento en recepción.
        </p>
      </Card>
    </div>
  );
}

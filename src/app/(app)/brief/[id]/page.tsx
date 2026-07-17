import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getSessionBrief } from "@/lib/brief-queries";
import BriefCard from "./brief-card";

export default async function SessionBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const { id } = await params;

  const brief = await getSessionBrief({
    orgId: session.user.orgId,
    sessionId: id,
    actorUserId: session.user.id,
    actorRole: session.user.role,
  });
  if (!brief) notFound();

  const { session: cls, roster, canSeeHealth } = brief;
  const doneCount = roster.filter((r) => r.debrief).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href={`/agenda/session/${cls.id}`} className="text-sm text-indigo-600 hover:underline">
            ← Volver al detalle de sesión
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            Session Brief · {cls.name}
          </h1>
          <p className="text-sm text-slate-500">
            {cls.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
            {cls.startTime} · {cls.center.name} · {cls.trainer?.name ?? "Sin entrenador"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-slate-800">
            {doneCount}/{roster.length}
          </div>
          <div className="text-xs text-slate-400">debriefs registrados</div>
        </div>
      </div>

      {!canSeeHealth && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Tu rol no tiene acceso a los indicadores de salud (Semáforo de Aptitud).
          Puedes registrar el Debrief igualmente.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {roster.map((entry) => (
          <BriefCard key={entry.bookingId} entry={entry} sessionId={cls.id} canSeeHealth={canSeeHealth} />
        ))}
      </div>

      {roster.length === 0 && (
        <p className="text-sm text-slate-500">Nadie tiene reserva confirmada en esta sesión.</p>
      )}
    </div>
  );
}

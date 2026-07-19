import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getSessionBrief } from "@/lib/brief-queries";
import { EmptyState } from "@/components/ui/empty-state";
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
    <div className="tz-page space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href={`/agenda/session/${cls.id}`} className="text-sm text-tz-black hover:underline">
            ← Volver al detalle de sesión
          </Link>
          <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black mt-1.5">
            Session Brief · {cls.name}
          </h1>
          <p className="text-sm text-muted">
            {cls.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
            {cls.startTime} · {cls.center.name} · {cls.trainer?.name ?? "Sin entrenador"}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display font-extrabold text-2xl text-tz-black tz-nums">
            {doneCount}/{roster.length}
          </div>
          <div className="text-xs text-faint">debriefs registrados</div>
        </div>
      </div>

      {!canSeeHealth && (
        <div className="text-sm text-warning-text bg-warning-bg border border-tz-linen rounded-control p-3">
          Tu rol no tiene acceso a los indicadores de salud (Semáforo de Aptitud).
          Puedes registrar el Debrief igualmente.
        </div>
      )}

      {roster.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card">
          <EmptyState title="Sin reservas" description="Nadie tiene reserva confirmada en esta sesión." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {roster.map((entry, i) => (
            <BriefCard key={entry.bookingId} entry={entry} sessionId={cls.id} canSeeHealth={canSeeHealth} delay={i < 6 ? i * 0.05 : 0} />
          ))}
        </div>
      )}
    </div>
  );
}

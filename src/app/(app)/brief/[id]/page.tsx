import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getSessionBrief } from "@/lib/brief-queries";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import BriefCard from "./brief-card";

const LIGHT_ORDER: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

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

  // Primero quienes necesitan atención (evitar > adaptar > resto), luego alfabético.
  const sorted = [...roster].sort(
    (a, b) => (a.light ? LIGHT_ORDER[a.light] : 3) - (b.light ? LIGHT_ORDER[b.light] : 3)
  );

  const doneCount = roster.filter((r) => r.debrief).length;
  const pct = roster.length ? Math.round((doneCount / roster.length) * 100) : 0;
  const avoidCount = roster.filter((r) => r.light === "RED").length;
  const adaptCount = roster.filter((r) => r.light === "AMBER").length;
  const newCount = roster.filter((r) => r.isNew).length;

  return (
    <div className="tz-page space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="space-y-1.5">
          <Link href={`/agenda/session/${cls.id}`} className="text-sm text-tz-black hover:underline">
            ← Volver al detalle de sesión
          </Link>
          <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">
            Session Brief · {cls.name}
          </h1>
          <p className="text-sm text-muted">
            {cls.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
            {cls.startTime} · {cls.center.name} · {cls.trainer?.name ?? "Sin entrenador"}
          </p>
          <p className="text-sm text-text-2 max-w-2xl">
            Tu repaso de 90 segundos antes de abrir la puerta: quién viene y qué debe evitar o
            adaptar cada persona. Al terminar, registra con un toque cómo le ha ido a cada una.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display font-extrabold text-2xl text-tz-black tz-nums">
            {doneCount}/{roster.length}
          </div>
          <div className="text-xs text-faint">debriefs registrados</div>
          <div className="w-28 h-1.5 bg-tz-sand rounded-pill mt-1.5 ml-auto overflow-hidden">
            <div
              className="h-full bg-tz-black rounded-pill transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {roster.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {canSeeHealth && avoidCount > 0 && (
            <Badge tone="critical">{avoidCount} con bloques a evitar</Badge>
          )}
          {canSeeHealth && adaptCount > 0 && (
            <Badge tone="warning">{adaptCount} con adaptaciones</Badge>
          )}
          {canSeeHealth && avoidCount === 0 && adaptCount === 0 && (
            <Badge tone="good">Sin restricciones en el grupo</Badge>
          )}
          {newCount > 0 && <Badge tone="trial">{newCount === 1 ? "1 nuevo" : `${newCount} nuevos`}</Badge>}
        </div>
      )}

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
          {sorted.map((entry, i) => (
            <BriefCard key={entry.bookingId} entry={entry} sessionId={cls.id} canSeeHealth={canSeeHealth} delay={i < 6 ? i * 0.05 : 0} />
          ))}
        </div>
      )}
    </div>
  );
}

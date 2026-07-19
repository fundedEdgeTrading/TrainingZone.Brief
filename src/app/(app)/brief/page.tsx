import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function BriefIndexPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endRange = new Date(today);
  endRange.setDate(endRange.getDate() + 3);

  const sessions = await prisma.classSession.findMany({
    where: {
      orgId: session.user.orgId,
      date: { gte: today, lt: endRange },
      status: "SCHEDULED",
      ...(session.user.role === "TRAINER" ? { trainerId: session.user.id } : {}),
    },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: { where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } }, select: { id: true } },
    },
    orderBy: { date: "asc" },
  });

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Elige una sesión para ver la vista previa de 90 segundos antes de abrir la puerta." />

      {sessions.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card">
          <EmptyState title="Sin sesiones próximas" description="No hay sesiones asignadas en los próximos días." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {sessions.map((s, i) => {
            const isToday = s.date.getTime() === today.getTime();
            return (
              <Link
                key={s.id}
                href={`/brief/${s.id}`}
                className="group block bg-brand-card border border-brand-border rounded-card p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:shadow-hover hover:border-brand-border-hover tz-fade-up"
                style={i < 6 ? { animationDelay: `${(i * 0.05).toFixed(2)}s` } : undefined}
              >
                <div className="text-xs text-faint">
                  {isToday ? "Hoy" : s.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })} ·{" "}
                  {s.startTime}
                </div>
                <div className="font-semibold text-tz-black mt-1 group-hover:underline">{s.name}</div>
                <div className="text-sm text-muted">{s.center.name} · {s.trainer?.name ?? "Sin entrenador"}</div>
                <div className="text-sm text-faint mt-2 tz-nums">{s.bookings.length} reservas</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

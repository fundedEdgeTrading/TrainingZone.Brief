import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { formatDateParam, zonedToday } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { expandOccurrences, isSameDay, ownSessionsWhere, sessionsInRangeWhere } from "@/lib/session-occurrences";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function BriefIndexPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  // RB-PLAN-003: además del rol, el plan contratado. Sin esto, la URL directa
  // se saltaría el filtro del menú.
  await requireFeature("salud_aptitud");

  // "Hoy" es el del centro: con la hora del servidor (UTC) el índice de briefs
  // saltaba de día dos horas antes de medianoche en España.
  const today = zonedToday(await resolveTimezoneForCenter(session.user.centerId));
  const endRange = new Date(today);
  endRange.setDate(endRange.getDate() + 3);

  const rows = await prisma.classSession.findMany({
    where: {
      orgId: session.user.orgId,
      status: "SCHEDULED",
      ...sessionsInRangeWhere(today, endRange),
      // El entrenador ve también las que dirigió sin tenerlas asignadas: es el
      // mismo criterio con el que `canViewSessionDebrief` le deja abrirlas.
      ...(session.user.role === "TRAINER" ? ownSessionsWhere(session.user.id) : {}),
    },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
        select: { id: true, occurrenceDate: true },
      },
    },
    orderBy: { date: "asc" },
  });

  // Una serie recurrente es una sola fila: hay que proyectar sus ocurrencias
  // para que aparezca cada día que toca, con la fecha real de ese día.
  const sessions = expandOccurrences(rows, today, endRange);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Elige una sesión para ver la vista previa de 90 segundos antes de abrir la puerta." />

      {sessions.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-card shadow-card">
          <EmptyState title="Sin sesiones próximas" description="No hay sesiones asignadas en los próximos días." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {sessions.map(({ session: s, date }, i) => {
            const isToday = date.getTime() === today.getTime();
            // Las reservas cuelgan de la fila de la serie: el contador es el de
            // ESTE día, no el de todas las ocurrencias juntas.
            const dayBookings = s.bookings.filter((b) => isSameDay(b.occurrenceDate, date));
            return (
              <Link
                key={`${s.id}-${formatDateParam(date)}`}
                href={`/brief/${s.id}?d=${formatDateParam(date)}`}
                className="group block bg-brand-card border border-brand-border rounded-card p-4 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:shadow-hover hover:border-brand-border-hover tz-fade-up"
                style={i < 6 ? { animationDelay: `${(i * 0.05).toFixed(2)}s` } : undefined}
              >
                <div className="text-xs text-faint">
                  {isToday ? "Hoy" : date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })} ·{" "}
                  {s.startTime}
                </div>
                <div className="font-semibold text-tz-black mt-1 group-hover:underline">{s.name}</div>
                <div className="text-sm text-muted">{s.center.name} · {s.trainer?.name ?? "Sin entrenador"}</div>
                <div className="text-sm text-faint mt-2 tz-nums">{dayBookings.length} reservas</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

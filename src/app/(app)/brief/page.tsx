import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function BriefIndexPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Session Brief</h1>
        <p className="text-sm text-slate-500">
          Elige una sesión para ver la vista previa de 90 segundos antes de abrir la puerta.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sessions.map((s) => {
          const isToday = s.date.getTime() === today.getTime();
          return (
            <Link
              key={s.id}
              href={`/brief/${s.id}`}
              className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition"
            >
              <div className="text-xs text-slate-400">
                {isToday ? "Hoy" : s.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })} ·{" "}
                {s.startTime}
              </div>
              <div className="font-semibold text-slate-800 mt-1">{s.name}</div>
              <div className="text-sm text-slate-500">{s.center.name} · {s.trainer?.name ?? "Sin entrenador"}</div>
              <div className="text-sm text-slate-400 mt-2">{s.bookings.length} reservas</div>
            </Link>
          );
        })}
      </div>

      {sessions.length === 0 && (
        <p className="text-sm text-slate-500">No hay sesiones próximas asignadas.</p>
      )}
    </div>
  );
}

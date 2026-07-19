import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getSessionDetail } from "@/lib/agenda-queries";
import { MEMBER_STATE_COLOR, MEMBER_STATE_LABEL } from "@/lib/chart-colors";
import CheckinButton from "./checkin-button";

const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Reservado",
  WAITLISTED: "Lista de espera",
  CANCELLED: "Cancelado",
  ATTENDED: "Asistió",
  NO_SHOW: "No-show",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const { id } = await params;
  const cls = await getSessionDetail(session.user.orgId, id);
  if (!cls) notFound();

  const booked = cls.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "WAITLISTED");
  const waitlisted = cls.bookings.filter((b) => b.status === "WAITLISTED");

  return (
    <div className="space-y-4">
      <div>
        <Link href="/agenda" className="text-sm text-tz-black hover:underline">
          ← Volver a la agenda
        </Link>
      </div>

      <div className="bg-white border border-tz-linen rounded-xl p-5">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-semibold text-tz-black">{cls.name}</h1>
            <p className="text-sm text-muted">
              {cls.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
              {cls.startTime}–{cls.endTime} · {cls.center.name} {cls.room ? `· ${cls.room}` : ""}
            </p>
            <p className="text-sm text-muted">Entrenador: {cls.trainer?.name ?? "Sin asignar"}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-tz-black">
              {booked.length}/{cls.capacity}
            </div>
            <div className="text-xs text-faint">plazas ocupadas</div>
            <Link
              href={`/brief/${cls.id}`}
              className="inline-block mt-2 text-xs rounded-lg bg-tz-black text-white px-3 py-1.5 hover:bg-brand-ink-soft"
            >
              Abrir Session Brief →
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white border border-tz-linen rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-tz-sand text-sm font-semibold text-text-2">
          Roster ({booked.length})
        </div>
        <table className="w-full text-sm">
          <thead className="bg-tz-bone text-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Socio</th>
              <th className="text-left px-4 py-2">Estado del socio</th>
              <th className="text-left px-4 py-2">Estado reserva</th>
              <th className="text-left px-4 py-2">Check-in</th>
            </tr>
          </thead>
          <tbody>
            {booked.map((b) => (
              <tr key={b.id} className="border-t border-tz-sand">
                <td className="px-4 py-2">
                  <Link href={`/members/${b.member.id}`} className="text-tz-black hover:underline">
                    {b.member.firstName} {b.member.lastName}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: MEMBER_STATE_COLOR[b.member.state] }}
                  >
                    {MEMBER_STATE_LABEL[b.member.state]}
                  </span>
                </td>
                <td className="px-4 py-2 text-text-2">{STATUS_LABEL[b.status]}</td>
                <td className="px-4 py-2">
                  <CheckinButton bookingId={b.id} sessionId={cls.id} checkedIn={b.status === "ATTENDED"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {waitlisted.length > 0 && (
          <>
            <div className="px-5 py-3 border-t border-b border-tz-sand text-sm font-semibold text-text-2">
              Lista de espera ({waitlisted.length})
            </div>
            <table className="w-full text-sm">
              <tbody>
                {waitlisted.map((b) => (
                  <tr key={b.id} className="border-t border-tz-sand">
                    <td className="px-4 py-2">
                      <Link href={`/members/${b.member.id}`} className="text-tz-black hover:underline">
                        {b.member.firstName} {b.member.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-faint text-xs">
                      posición {b.waitlistPosition ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

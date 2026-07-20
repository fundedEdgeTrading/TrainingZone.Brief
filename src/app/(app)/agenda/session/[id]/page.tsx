import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { getSessionDetail } from "@/lib/agenda-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE } from "@/lib/chart-colors";
import { Badge } from "@/components/ui/badge";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";
import CheckinButton from "./checkin-button";
import { DirectorSelect, SelfBookableToggle } from "./ep-session-controls";

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

  // Ámbito de centro: el staff no organizacional solo abre sesiones de centros
  // a los que está imputado (su centro base o vía CenterMembership).
  await requireCenterRole(cls.centerId, ["CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);

  const isEpSession = cls.classType === "Personal Training";
  const trainers = isEpSession ? await listAssignableStaff(session.user.orgId, ["TRAINER"]) : [];

  const booked = cls.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "WAITLISTED");
  const waitlisted = cls.bookings.filter((b) => b.status === "WAITLISTED");

  return (
    <div className="tz-page space-y-4">
      <div>
        <Link href="/agenda" className="text-sm text-tz-black hover:underline">
          ← Volver a la agenda
        </Link>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-card p-5 shadow-card">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-tz-black">{cls.name}</h1>
            <p className="text-sm text-muted mt-1">
              {cls.date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
              {cls.startTime}–{cls.endTime} · {cls.center.name} {cls.room ? `· ${cls.room}` : ""}
            </p>
            <p className="text-sm text-muted">Entrenador: {cls.trainer?.name ?? "Sin asignar"}</p>
            {isEpSession && (
              <div className="flex flex-col gap-1.5 mt-2">
                <DirectorSelect sessionId={cls.id} directedByUserId={cls.directedByUserId} trainers={trainers} />
                <SelfBookableToggle sessionId={cls.id} selfBookable={cls.selfBookable} />
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-display font-extrabold text-2xl text-tz-black tz-nums">
              {booked.length}/{cls.capacity}
            </div>
            <div className="text-xs text-faint">plazas ocupadas</div>
            <Link
              href={`/brief/${cls.id}`}
              className="inline-flex items-center mt-2 text-xs font-semibold rounded-control bg-tz-black text-white px-3.5 py-2 transition-colors duration-150 hover:bg-brand-ink-soft"
            >
              Abrir Session Brief →
            </Link>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-text-2 mb-2">Roster ({booked.length})</h2>
      <TableShell>
        <THead>
          <Th>Socio</Th>
          <Th>Estado del socio</Th>
          <Th>Estado reserva</Th>
          <Th>Check-in</Th>
        </THead>
        <tbody>
          {booked.map((b) => (
            <TRow key={b.id}>
              <Td>
                <Link href={`/members/${b.member.id}`} className="text-tz-black hover:underline">
                  {b.member.firstName} {b.member.lastName}
                </Link>
              </Td>
              <Td>
                <Badge tone={MEMBER_STATE_TONE[b.member.state]}>{MEMBER_STATE_LABEL[b.member.state]}</Badge>
              </Td>
              <Td className="text-text-2">{STATUS_LABEL[b.status]}</Td>
              <Td>
                <CheckinButton bookingId={b.id} sessionId={cls.id} checkedIn={b.status === "ATTENDED"} />
              </Td>
            </TRow>
          ))}
        </tbody>
      </TableShell>
      </div>

      {waitlisted.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-2 mb-2">Lista de espera ({waitlisted.length})</h2>
          <TableShell>
            <tbody>
              {waitlisted.map((b) => (
                <TRow key={b.id}>
                  <Td>
                    <Link href={`/members/${b.member.id}`} className="text-tz-black hover:underline">
                      {b.member.firstName} {b.member.lastName}
                    </Link>
                  </Td>
                  <Td className="text-faint text-xs">posición {b.waitlistPosition ?? "—"}</Td>
                </TRow>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}
    </div>
  );
}

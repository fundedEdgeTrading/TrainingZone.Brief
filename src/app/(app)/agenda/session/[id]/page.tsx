import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { getSessionDetail, listMembersBookableForSession } from "@/lib/agenda-queries";
import { formatDateParam } from "@/lib/date-utils";
import { canViewSessionDebrief } from "@/lib/rbac";
import { listAssignableStaff } from "@/lib/org-queries";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE } from "@/lib/chart-colors";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import CheckinButton from "./checkin-button";
import CancelBookingButton from "./cancel-booking-button";
import BookMemberForm from "./book-member-form";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const { id } = await params;
  const { d } = await searchParams;
  // `cls.date` es la fecha base de la serie recurrente; el día concreto que se
  // está mirando viene en `?d=` y solo se acepta si existe esa ocurrencia. El
  // roster que devuelve `getSessionDetail` es ya el de ese día.
  const cls = await getSessionDetail(session.user.orgId, id, d);
  if (!cls) notFound();
  const { occurrenceDate } = cls;

  // Ámbito de centro: el staff no organizacional solo abre sesiones de centros
  // a los que está imputado (su centro base o vía CenterMembership).
  await requireCenterRole(cls.centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);

  const isEpSession = cls.classType === "Personal Training";
  const trainers = isEpSession ? await listAssignableStaff(session.user.orgId, ["TRAINER", "TRAINER_ADMIN"], cls.centerId) : [];

  const booked = cls.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "WAITLISTED");
  const waitlisted = cls.bookings.filter((b) => b.status === "WAITLISTED");

  // Reserva puntual desde el mostrador (grupo reducido; en EP la franja la
  // asigna el diálogo de la agenda). Solo se ofrece a quien tiene bono de esta
  // modalidad en este centro: quien ya ocupa plaza ese día sale de la lista, y
  // quien espera se queda, porque elegirlo reclama su plaza liberada.
  const waitingMemberIds = new Set(waitlisted.map((b) => b.member.id));
  const bookedMemberIds = new Set(booked.map((b) => b.member.id));
  const bookableMembers = isEpSession
    ? []
    : (await listMembersBookableForSession(session.user.orgId, cls.id))
        .filter((m) => !bookedMemberIds.has(m.id))
        .map((m) => ({ ...m, waiting: waitingMemberIds.has(m.id) }));

  // El debrief es confidencial del entrenador asignado (o quien la dirigió) y
  // dirección; ocultamos el acceso al resto para no dejar un enlace muerto.
  const canOpenDebrief = canViewSessionDebrief(session.user.role, session.user.id, cls);

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
              {occurrenceDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
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
            {canOpenDebrief && (
              <Link
                href={`/brief/${cls.id}?d=${formatDateParam(occurrenceDate)}`}
                className="inline-flex items-center mt-2 text-xs font-semibold rounded-control bg-tz-black text-white px-3.5 py-2 transition-colors duration-150 hover:bg-brand-ink-soft"
              >
                Abrir Session Brief →
              </Link>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
          <h2 className="text-sm font-semibold text-text-2">Roster ({booked.length})</h2>
          {!isEpSession && (
            <BookMemberForm
              sessionId={cls.id}
              occurrenceDate={formatDateParam(occurrenceDate)}
              members={bookableMembers}
              full={booked.length >= cls.capacity}
            />
          )}
        </div>
        <DataTable
          columns={rosterColumns}
          rows={booked.map((b) => bookingToRow(b, cls.id))}
          emptyTitle="Sin reservas"
          emptyDescription="Todavía no hay ningún socio apuntado a esta sesión."
        />
      </div>

      {waitlisted.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-2 mb-2">Lista de espera ({waitlisted.length})</h2>
          <DataTable columns={waitlistColumns} rows={waitlisted.map(waitlistToRow)} />
        </div>
      )}
    </div>
  );
}

type Booking = NonNullable<Awaited<ReturnType<typeof getSessionDetail>>>["bookings"][number];

const rosterColumns: DataTableColumn[] = [
  { key: "member", header: "Socio", sortable: true },
  { key: "memberState", header: "Estado del socio", sortable: true },
  { key: "status", header: "Estado reserva", sortable: true, className: "text-text-2" },
  { key: "checkin", header: "Check-in" },
  { key: "actions", header: "Acciones" },
];

function bookingToRow(b: Booking, sessionId: string): DataTableRow {
  return {
    key: b.id,
    sortValues: {
      member: `${b.member.lastName} ${b.member.firstName}`,
      memberState: MEMBER_STATE_LABEL[b.member.state],
      status: STATUS_LABEL[b.status],
    },
    cells: {
      member: (
        <Link href={`/members/${b.member.id}`} className="text-tz-black hover:underline">
          {b.member.firstName} {b.member.lastName}
        </Link>
      ),
      memberState: <Badge tone={MEMBER_STATE_TONE[b.member.state]}>{MEMBER_STATE_LABEL[b.member.state]}</Badge>,
      status: STATUS_LABEL[b.status],
      checkin: <CheckinButton bookingId={b.id} sessionId={sessionId} checkedIn={b.status === "ATTENDED"} />,
      actions: b.status === "BOOKED" && (
        <CancelBookingButton bookingId={b.id} sessionId={sessionId} memberName={`${b.member.firstName} ${b.member.lastName}`} />
      ),
    },
  };
}

const waitlistColumns: DataTableColumn[] = [
  { key: "member", header: "Socio", sortable: true },
  { key: "position", header: "Posición", sortable: true },
];

function waitlistToRow(b: Booking): DataTableRow {
  return {
    key: b.id,
    sortValues: {
      member: `${b.member.lastName} ${b.member.firstName}`,
      position: b.waitlistPosition ?? Number.MAX_SAFE_INTEGER,
    },
    cells: {
      member: (
        <Link href={`/members/${b.member.id}`} className="text-tz-black hover:underline">
          {b.member.firstName} {b.member.lastName}
        </Link>
      ),
      position: <span className="text-faint text-xs">posición {b.waitlistPosition ?? "—"}</span>,
    },
  };
}

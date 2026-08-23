import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole, memberIsInScope } from "@/lib/guard";
import {
  getMemberDetail,
  getMemberAttendanceStats,
  getMemberNotes,
  getMemberServiceKinds,
  getSessionBalances,
  getMemberSessionCalendar,
  listCentersForOrg,
  listActivePlansForOrg,
  listClientGoalTemplates,
} from "@/lib/members-queries";
import { getCentersForUser } from "@/lib/agenda-queries";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { formatDateParam, zonedToday } from "@/lib/date-utils";
import { getHealthRecordsForMember } from "@/lib/health-access";
import { listAssessmentsForMember } from "@/lib/assessments/queries";
import { ASSESSMENT_KIND_LABEL } from "@/lib/assessments/schemas";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE, PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import {
  canAdjustSessionBalance,
  canDeleteMembers,
  canManageMesocycles,
  canManageOrg,
  canViewHealthData,
} from "@/lib/rbac";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import SectionRail, { SectionHead, SectionHeadDisclosure, type Section, type SectionKey } from "./section-rail";
import { EditMemberDataButton, NewNoteButton } from "./member-header-actions";
import { ActivityThread, type ActivityEntry } from "./activity-thread";
import { AddHealthRecordForm, ResolveHealthButton, AddNoteForm, ResendWelcomeButton } from "./member-forms";
import { MemberDataPanel, DeleteMemberSection } from "./member-data-panel";
import { EditableMemberPhoto } from "./member-photo";
import { AddProgressEntryForm, ProgressComparator, TanitaPasteImportForm } from "./progress-forms";
import { BodyCompositionChart } from "./composition-chart";
import { CompositionSummary } from "./composition-summary";
import { buildCompositionView } from "@/lib/composition-view";
import { ClientGoalsPanel, GoalTemplateForm } from "./member-profile-forms";
import {
  FreezeSubscriptionForm,
  ResumeSubscriptionButton,
  ScheduleCancellationForm,
  CancelScheduledCancellationButton,
  UpdateSubscriptionPriceForm,
  AddOneOffProductForm,
  AddSubscriptionForm,
} from "./subscription-forms";
import { canManageBilling } from "@/lib/rbac";
import { SingleMetricChart } from "@/components/single-metric-chart";
import { BonosPanel, type BonoAction } from "./bonos-panel";
import { MemberSessionsCalendar } from "./member-calendar";
import { listMesocyclesForMember } from "@/lib/mesocycle-queries";
import { openRetentionAlertsByMember } from "@/lib/retention";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { MesocyclePanel, MESOCYCLE_STATUS_LABEL, MESOCYCLE_STATUS_TONE } from "./mesociclos/panel";

const SERVICE_KIND_LABEL: Record<string, string> = { EP: "Personal Training", GROUP: "Grupos", ONLINE: "Online" };

const HEALTH_TYPE_LABEL: Record<string, string> = {
  INJURY: "Lesión",
  CHRONIC_CONDITION: "Condición crónica",
  MEDICATION: "Medicación",
  SURGERY: "Cirugía",
  PREGNANCY: "Embarazo",
  ALLERGY: "Alergia",
};

const SEVERITY_LABEL: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta" };

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PAID: "Pagado",
  PENDING: "Pendiente",
  FAILED: "Fallido",
  REFUNDED: "Devuelto",
};

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  PAID: "text-good",
  PENDING: "text-warning",
  FAILED: "text-critical",
  REFUNDED: "text-brand-muted",
};

const FEELING_DOT: Record<string, string> = { GREEN: "bg-good", AMBER: "bg-warning", RED: "bg-critical" };
const FEELING_LABEL: Record<string, string> = {
  GREEN: "Debrief verde",
  AMBER: "Debrief ámbar",
  RED: "Debrief rojo",
};

const BOOKING_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ATTENDED: { label: "Asistió", tone: "good" },
  NO_SHOW: { label: "No-show", tone: "critical" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  BOOKED: { label: "Reservada", tone: "neutral" },
  WAITLISTED: { label: "Lista de espera", tone: "warning" },
};

// Formateo propio, sin toLocaleDateString: el ICU de Node y el del navegador no
// coinciden en es-ES y estas cadenas viajan como props a componentes de cliente.
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

function fmtDay(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtShortDay(d: Date) {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Antigüedad en meses cumplidos desde el alta, en el formato corto del diseño. */
function seniority(from: Date) {
  const now = new Date();
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  return years > 0 ? `${years} a ${months % 12} m` : `${months} m`;
}

/**
 * Celda de la franja de métricas de la cabecera. Los separadores se declaran
 * celda a celda porque la rejilla es de 2 columnas en móvil y de 4 en `lg`, y
 * `divide-x` pondría línea al empezar cada fila.
 */
const METRIC_BORDER = [
  "border-r border-b lg:border-b-0",
  "border-b lg:border-b-0 lg:border-r",
  "border-r",
  "",
];

function Metric({
  label,
  value,
  foot,
  position,
}: {
  label: string;
  value: React.ReactNode;
  foot: string;
  position: 0 | 1 | 2 | 3;
}) {
  return (
    <div className={`p-4 px-[26px] border-brand-subtle-2 ${METRIC_BORDER[position]}`}>
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-brand-muted">{label}</div>
      <div className="font-display font-extrabold text-[22px] text-brand-text tz-nums mt-1 leading-none">{value}</div>
      <div className="text-[11px] text-brand-faint mt-1">{foot}</div>
    </div>
  );
}

function SubHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <h3 className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-text">{title}</h3>
      {action}
    </div>
  );
}

/**
 * Cabecera de bloque cuyo botón despliega un formulario. Es un `<details>`
 * nativo: no hace falta bajar estado al cliente solo para abrir un formulario.
 */
function DisclosureSubHead({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mb-3">
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-text">{title}</h3>
        <span className="inline-flex items-center justify-center rounded-lg border border-brand-border bg-white px-[13px] py-2 text-xs font-semibold text-brand-text transition-[background-color,border-color] duration-200 hover:border-brand-ink hover:bg-tz-bone">
          {label}
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function ConsentTile({ label, at, pending }: { label: string; at: Date | null; pending: string }) {
  return (
    <div className={`border border-brand-border rounded-xl p-[13px_14px] ${at ? "bg-brand-bg" : "bg-white"}`}>
      <div className="text-[11px] font-bold uppercase tracking-[.08em] text-brand-muted">{label}</div>
      {at ? (
        <>
          <div className="text-[13px] font-bold text-good mt-1.5">Firmado</div>
          <div className="text-[11px] text-brand-faint tz-nums">{fmtDay(at)}</div>
        </>
      ) : (
        <>
          <div className="text-[13px] font-bold text-brand-muted mt-1.5">Pendiente</div>
          <div className="text-[11px] text-brand-faint">{pending}</div>
        </>
      )}
    </div>
  );
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const { id } = await params;
  const { s } = await searchParams;
  // `?s=socio`. Con la clave repetida llega un array: nos quedamos con la primera.
  const initialSection = Array.isArray(s) ? s[0] : s;

  const member = await getMemberDetail(session.user.orgId, id);
  if (!member) notFound();
  // Ámbito de centro: la ficha arrastra salud, composición y valoraciones, así
  // que no basta con que el socio sea de la organización — tiene que ser de un
  // centro del que esta persona forme parte. `notFound` y no un error: desde
  // fuera del ámbito, la ficha sencillamente no existe.
  if (!(await memberIsInScope(session.user, member.id))) notFound();

  const canSeeMesocycles = canManageMesocycles(session.user.role);

  const [stats, healthRecords, notes, goalTemplates, centers, plans, assessments, mesocycles, retentionAlerts] =
    await Promise.all([
      getMemberAttendanceStats(member.id),
      getHealthRecordsForMember({
        memberId: member.id,
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        actorRole: session.user.role,
      }),
      getMemberNotes(session.user.orgId, member.id),
      listClientGoalTemplates(session.user.orgId),
      listCentersForOrg(session.user.orgId),
      listActivePlansForOrg(session.user.orgId),
      listAssessmentsForMember(session.user.orgId, member.id),
      canSeeMesocycles ? listMesocyclesForMember(session.user.orgId, member.id) : Promise.resolve([]),
      openRetentionAlertsByMember([member.id]),
    ]);

  // Caída de frecuencia respecto a SU línea base (G.3). El motor
  // (`src/lib/retention.ts`) la recalcula en cada pasada del cron y la cierra
  // sola cuando el socio vuelve a su ritmo, así que lo que hay aquí está vivo.
  const retentionRisk = retentionAlerts.get(member.id) ?? null;

  // Las valoraciones son trabajo de entrenador y arrastran screening de salud:
  // recepción ve la ficha pero no este bloque (mismo criterio que /salud).
  const canSeeAssessments = canViewHealthData(session.user.role);

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
  // RB-AGENDA-003: un socio puede tener varios bonos ACTIVE/FROZEN a la vez
  // (EP y grupos, en centros distintos) — "Plan y pagos" gestiona cada uno por
  // separado, no solo el primero.
  const manageableSubscriptions = member.subscriptions.filter((s) => s.status === "ACTIVE" || s.status === "FROZEN");
  const activeSubscriptionSummary =
    manageableSubscriptions.length === 0
      ? null
      : manageableSubscriptions.length === 1
        ? manageableSubscriptions[0].plan.name
        : `${manageableSubscriptions.length} bonos activos`;
  const canManageSub = canManageBilling(session.user.role);
  const canDelete = canDeleteMembers(session.user.role);

  // Sesiones del bono. El mes en curso sale de la zona del CENTRO y no de
  // `new Date()` del servidor (UTC): el día 1 a medianoche en España abriría el
  // mes anterior (mismo fallo ya corregido en /agenda).
  const calendarTz = await resolveTimezoneForCenter(member.primaryCenterId);
  const calendarToday = zonedToday(calendarTz);
  const calendarMonthStart = new Date(calendarToday.getFullYear(), calendarToday.getMonth(), 1);
  // Ventana precargada: 12 meses atrás + el actual + el siguiente. Fuera de
  // ella el propio componente pide el mes con `fetchMemberSessionsMonth`, para
  // no tener que cambiar la URL — eso re-renderizaría esta página y
  // `getHealthRecordsForMember` escribe una fila de auditoría por cada lectura.
  const calendarFrom = new Date(calendarMonthStart);
  calendarFrom.setMonth(calendarFrom.getMonth() - 12);
  const calendarTo = new Date(calendarMonthStart);
  calendarTo.setMonth(calendarTo.getMonth() + 2);

  const [calendarEvents, openableCenters] = await Promise.all([
    getMemberSessionCalendar(session.user.orgId, member.id, calendarFrom, calendarTo),
    // /agenda/session/[id] exige requireCenterRole: sin esto, el enlace echaría
    // de la ficha a quien no esté imputado al centro del bono (RB-AGENDA-003:
    // el bono puede ser de otro centro de la misma organización).
    getCentersForUser(session.user),
  ]);

  const sessionBalances = getSessionBalances(
    member.subscriptions.map((s) => ({
      status: s.status,
      sessionsRemaining: s.sessionsRemaining,
      plan: { type: s.plan.type, sessionsIncluded: s.plan.sessionsIncluded },
    }))
  );

  // CC1.4/CC2/CC3 (docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md): última toma con semáforo +
  // serie para la gráfica de evolución. Rango de referencia sin filtro de sexo (dato no
  // capturado hoy — ver §8.1 "riesgos abiertos" del doc de composición).
  const { compositionTiles, compositionChartPoints, bodyFatChartPoints, measuredAt } = await buildCompositionView(
    session.user.orgId,
    member.birthDate,
    member.progressEntries
  );

  // ---- Franja de métricas de la cabecera --------------------------------
  const unlimitedBono = manageableSubscriptions.some((s) => s.sessionsRemaining == null);
  const remainingTotal = manageableSubscriptions.reduce((acc, s) => acc + (s.sessionsRemaining ?? 0), 0);
  const includedTotal = manageableSubscriptions.reduce((acc, s) => acc + (s.plan.sessionsIncluded ?? 0), 0);

  const todayISO = formatDateParam(calendarToday);
  const nextBooking = member.bookings
    .filter((b) => b.status === "BOOKED" && formatDateParam(b.occurrenceDate) >= todayISO)
    .sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime())[0];

  // ---- Hilo de actividad (asistencia + bitácora en un solo orden) --------
  const notesByDay = new Map<string, typeof notes>();
  for (const n of notes) {
    const key = formatDateParam(n.createdAt);
    const list = notesByDay.get(key) ?? [];
    list.push(n);
    notesByDay.set(key, list);
  }

  const activityEntries: { sortKey: number; entry: ActivityEntry }[] = [];

  for (const b of member.bookings) {
    const day = formatDateParam(b.occurrenceDate);
    const sameDayNotes = notesByDay.get(day) ?? [];
    notesByDay.delete(day);
    const status = BOOKING_STATUS[b.status] ?? { label: b.status, tone: "neutral" as BadgeTone };
    activityEntries.push({
      sortKey: b.occurrenceDate.getTime(),
      entry: {
        id: `booking-${b.id}`,
        day: fmtShortDay(b.occurrenceDate),
        time: b.session.startTime,
        title: b.session.name,
        badges: [{ label: status.label, tone: status.tone }],
        feeling: b.debrief
          ? { dotClass: FEELING_DOT[b.debrief.feeling], label: FEELING_LABEL[b.debrief.feeling] }
          : null,
        body: b.debrief?.note ?? null,
        footer: `Sesión · ${b.session.classType}`,
        notes: sameDayNotes.map((n) => ({
          id: n.id,
          body: n.body,
          footer: `Nota de bitácora · ${n.author?.name ?? "—"}`,
        })),
      },
    });
  }

  for (const list of notesByDay.values()) {
    for (const n of list) {
      activityEntries.push({
        sortKey: n.createdAt.getTime(),
        entry: {
          id: `note-${n.id}`,
          day: fmtShortDay(n.createdAt),
          time: fmtTime(n.createdAt),
          title: "Nota de bitácora",
          badges: [],
          feeling: null,
          body: n.body,
          footer: `Bitácora · ${n.author?.name ?? "—"}`,
          notes: [],
        },
      });
    }
  }

  for (const a of assessments) {
    if (!a.completedAt) continue;
    activityEntries.push({
      sortKey: a.completedAt.getTime(),
      entry: {
        id: `assessment-${a.id}`,
        day: fmtShortDay(a.completedAt),
        time: fmtTime(a.completedAt),
        title: `${ASSESSMENT_KIND_LABEL[a.kind]} completada`,
        badges: [],
        feeling: null,
        body: null,
        footer: "Valoración",
        notes: [],
      },
    });
  }

  activityEntries.push({
    sortKey: member.joinedAt.getTime(),
    entry: {
      id: "alta",
      day: fmtShortDay(member.joinedAt),
      time: null,
      title: "Alta como socio",
      badges: [{ label: MEMBER_STATE_LABEL[member.state] ?? member.state, tone: MEMBER_STATE_TONE[member.state] }],
      feeling: null,
      body: null,
      footer: `Contratación · ${member.primaryCenter.name}`,
      notes: [],
    },
  });

  activityEntries.sort((a, b) => b.sortKey - a.sortKey);
  const threadEntries = activityEntries.map((e) => e.entry);

  // ---- Metas del rail (derivadas de lo ya cargado, sin queries nuevas) ---
  const activeInjuries = healthRecords?.filter((h) => h.status === "ACTIVE").length ?? 0;
  const pendingAssessments = assessments.filter((a) => !a.completedAt).length;
  const lastEntry = member.progressEntries[0];

  const planMeta =
    manageableSubscriptions.length === 0
      ? "Sin bonos activos"
      : `${manageableSubscriptions.length} ${manageableSubscriptions.length === 1 ? "bono activo" : "bonos activos"} · ${
          unlimitedBono ? "sesiones ilimitadas" : `${remainingTotal} sesiones`
        }`;

  const railMeta: Record<SectionKey, string> = {
    socio:
      activeInjuries > 0
        ? `${activeInjuries} ${activeInjuries === 1 ? "lesión activa" : "lesiones activas"}`
        : "Contacto · Salud · Consentimientos",
    plan: planMeta,
    actividad: notes.length > 0 ? `${notes.length} ${notes.length === 1 ? "nota" : "notas"}` : "Asistencia y bitácora",
    entreno:
      pendingAssessments > 0 && canSeeAssessments
        ? `${pendingAssessments} ${pendingAssessments === 1 ? "valoración pendiente" : "valoraciones pendientes"}`
        : "Objetivos · Mesociclo · Valoraciones",
    evolucion: lastEntry
      ? `Última toma ${fmtShortDay(lastEntry.measuredAt ?? lastEntry.date)}`
      : "Composición y fotos",
  };

  // ---- Acciones de gestión de cada bono ---------------------------------
  const bonoActions: Record<string, BonoAction[]> = {};
  if (canManageSub) {
    for (const s of manageableSubscriptions) {
      bonoActions[s.id] = [
        s.status === "ACTIVE"
          ? { key: "congelar", label: "Congelar", content: <FreezeSubscriptionForm subscriptionId={s.id} /> }
          : {
              key: "reanudar",
              label: "Reanudar",
              content: <ResumeSubscriptionButton subscriptionId={s.id} memberId={member.id} />,
            },
        {
          key: "precio",
          label: "Cambiar precio",
          content: <UpdateSubscriptionPriceForm subscriptionId={s.id} />,
        },
        s.cancelAt
          ? {
              key: "baja",
              label: "Cancelar baja programada",
              tone: "danger",
              content: <CancelScheduledCancellationButton subscriptionId={s.id} memberId={member.id} />,
            }
          : {
              key: "baja",
              label: "Programar baja",
              tone: "danger",
              content: <ScheduleCancellationForm subscriptionId={s.id} />,
            },
      ];
    }
  }

  const currentMesocycle = mesocycles[0] ?? null;

  const sections: Section[] = [
    {
      key: "socio",
      label: "Socio",
      meta: railMeta.socio,
      content: (
        <>
          <SectionHead
            title="Socio"
            description="Datos de contacto, salud y consentimientos en una sola ficha."
          />

          <MemberDataPanel
            centers={centers}
            member={{
              id: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
              phone: member.phone,
              address: member.address,
              addressLine2: member.addressLine2,
              postalCode: member.postalCode,
              city: member.city,
              province: member.province,
              country: member.country,
              birthDate: member.birthDate ? member.birthDate.toISOString().slice(0, 10) : null,
              sex: member.sex,
              occupation: member.occupation,
              emergencyContact: member.emergencyContact,
              primaryCenterId: member.primaryCenterId,
              primaryCenterName: member.primaryCenter.name,
              primaryCenterAddress: member.primaryCenter.address,
              joinedAt: member.joinedAt.toISOString(),
              state: member.state,
              consentContractAt: member.consentContractAt ? member.consentContractAt.toISOString() : null,
              consentHealthAt: member.consentHealthAt ? member.consentHealthAt.toISOString() : null,
              consentImagesAt: member.consentImagesAt ? member.consentImagesAt.toISOString() : null,
              consentMarketingAt: member.consentMarketingAt ? member.consentMarketingAt.toISOString() : null,
              consentAIAt: member.consentAIAt ? member.consentAIAt.toISOString() : null,
            }}
          />

          <div>
            {healthRecords !== null && member.consentHealth ? (
              <DisclosureSubHead title="Salud" label="Añadir registro">
                <AddHealthRecordForm memberId={member.id} />
              </DisclosureSubHead>
            ) : (
              <SubHead title="Salud" />
            )}
            {healthRecords === null ? (
              <div className="text-sm text-brand-muted bg-brand-bg border border-brand-border rounded-xl p-4">
                Acceso restringido: tu rol no tiene permiso para ver datos de salud de este socio (Art. 9 RGPD —
                acceso limitado al equipo del centro y dirección). Ver <span className="italic">Auditoría</span> para
                el registro de accesos.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {!member.consentHealth && (
                  <div className="text-sm text-brand-muted bg-brand-bg border border-brand-border rounded-xl p-4">
                    Este socio no ha firmado el consentimiento de datos de salud (Art. 9 RGPD). No se pueden
                    registrar lesiones ni condiciones hasta que lo otorgue.
                  </div>
                )}
                {healthRecords.length === 0 ? (
                  <p className="text-sm text-brand-muted">Sin registros de salud.</p>
                ) : (
                  <>
                    {healthRecords.map((h) => (
                      <div key={h.id} className="border border-brand-border rounded-xl p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-sm font-semibold text-brand-text">
                            {HEALTH_TYPE_LABEL[h.type]}
                            {h.zone ? ` — ${h.zone}` : ""}
                          </span>
                          <div className="flex items-center gap-2.5 shrink-0">
                            {h.status === "ACTIVE" && <ResolveHealthButton recordId={h.id} memberId={member.id} />}
                            <Badge tone={h.status === "ACTIVE" ? "warning" : "neutral"} dot={false}>
                              {h.status === "ACTIVE" ? "Activa" : "Resuelta"}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-[13px] text-text-2 text-pretty">{h.description}</p>
                        <p className="text-[11px] text-brand-faint">
                          Severidad {SEVERITY_LABEL[h.severity].toLowerCase()} · {h.reportedBy?.name ?? "—"} ·{" "}
                          {fmtDay(h.reportedAt)}
                        </p>
                      </div>
                    ))}
                    <p className="text-[11px] text-brand-faint">
                      Cada lectura y alta queda registrada en el log de auditoría (ADR-008).
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <SubHead title="Consentimientos" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <ConsentTile label="Contrato" at={member.consentContractAt} pending="Sin contrato firmado" />
              <ConsentTile label="Salud" at={member.consentHealthAt} pending="Sin registros de salud" />
              <ConsentTile label="Imágenes" at={member.consentImagesAt} pending="Sin fotos de evolución" />
              <ConsentTile label="Marketing" at={member.consentMarketingAt} pending="Sin comunicaciones" />
            </div>
          </div>

          {canDelete && (
            <DeleteMemberSection
              member={{
                id: member.id,
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
              }}
              activeSubscriptionPlan={activeSubscriptionSummary}
            />
          )}
        </>
      ),
    },
    {
      key: "plan",
      label: "Plan y pagos",
      meta: railMeta.plan,
      content: (
        <>
          {canManageSub ? (
            <SectionHeadDisclosure
              title="Plan y pagos"
              items={[
                {
                  key: "venta",
                  label: "Venta puntual",
                  variant: "secondary",
                  content: (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-brand-muted">Venta puntual (RB-PAGO-005)</p>
                      <AddOneOffProductForm memberId={member.id} />
                    </div>
                  ),
                },
                {
                  key: "bono",
                  label: "Añadir bono",
                  variant: "primary",
                  content: (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[.08em] text-brand-muted">Añadir bono</p>
                      <AddSubscriptionForm memberId={member.id} plans={plans} centers={centers} />
                    </div>
                  ),
                },
              ]}
            />
          ) : (
            <SectionHead
              title="Plan y pagos"
              description="Bonos, calendario de sesiones y pagos. La gestión del bono la lleva dirección."
            />
          )}

          <BonosPanel
            canAdjust={canAdjustSessionBalance(session.user.role)}
            balances={sessionBalances}
            actionsById={bonoActions}
            bonos={member.subscriptions.map((s) => ({
              id: s.id,
              planName: s.plan.name,
              planType: s.plan.type,
              sessionsIncluded: s.plan.sessionsIncluded,
              sessionsRemaining: s.sessionsRemaining,
              status: s.status,
              centerName: s.center.name,
              startDateISO: formatDateParam(s.startDate),
              endDateISO: s.endDate ? formatDateParam(s.endDate) : null,
              priceCents: s.priceCents,
              isRecurring: s.stripeSubscriptionId != null,
            }))}
          />

          <MemberSessionsCalendar
            memberId={member.id}
            events={calendarEvents}
            loadedFromMonth={formatDateParam(calendarFrom).slice(0, 7)}
            loadedToMonth={formatDateParam(calendarTo).slice(0, 7)}
            initialMonth={formatDateParam(calendarMonthStart).slice(0, 7)}
            todayISO={formatDateParam(calendarToday)}
            minMonth={formatDateParam(member.joinedAt).slice(0, 7)}
            openableCenterIds={openableCenters.map((c) => c.id)}
          />

          <div>
            <SubHead title="Pagos recientes" />
            {member.payments.length === 0 ? (
              <p className="text-sm text-brand-muted">Todavía no hay pagos registrados.</p>
            ) : (
              <table className="tz-stack-table w-full text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-[.08em] text-brand-muted text-left">
                  <tr>
                    <th className="pb-2">Fecha</th>
                    <th className="pb-2">Importe</th>
                    <th className="pb-2">Método</th>
                    <th className="pb-2">Estado</th>
                    <th className="pb-2">Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  {member.payments.map((p) => (
                    <tr key={p.id} className="border-t border-brand-subtle-2">
                      <td className="py-2.5 tz-nums" data-label="">
                        {fmtDay(p.date)}
                      </td>
                      <td className="py-2.5 tz-nums font-semibold" data-label="Importe">
                        {euros(p.amountCents)}
                      </td>
                      <td className="py-2.5" data-label="Método">
                        {PAYMENT_METHOD_LABEL[p.method]}
                      </td>
                      <td className="py-2.5" data-label="Estado">
                        <span className={`font-semibold ${PAYMENT_STATUS_CLASS[p.status]}`}>
                          {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-brand-faint" data-label="Recibo">
                        {p.receiptNumber}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ),
    },
    {
      key: "actividad",
      label: "Actividad",
      meta: railMeta.actividad,
      content: (
        <>
          <SectionHead title="Actividad" description="Asistencia y bitácora en un solo hilo cronológico." />

          {/* G.3: la señal de retención vive donde está la asistencia que la
              produce, no en una pantalla aparte. Las tres cifras de abajo dicen
              cuánto ha venido en total; esto dice si está dejando de venir. */}
          {retentionRisk && (
            <div className="rounded-xl border border-critical-bg bg-critical-bg p-[15px_16px]">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="critical">
                  {retentionRisk.riskLevel === "HIGH" ? "Riesgo alto de fuga" : "Riesgo de fuga"}
                </Badge>
                <span className="text-[13px] font-semibold text-critical tz-nums">
                  {retentionRisk.dropPct}% respecto a su ritmo habitual
                </span>
              </div>
              <p className="text-[12.5px] text-brand-text-2 mt-2 tz-nums">
                Venía {retentionRisk.baselineFreq.toFixed(1)} veces por semana (media de las 12 semanas previas) y en
                las últimas 2 semanas lleva {retentionRisk.recentFreq.toFixed(1)}.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
            <div className="border border-brand-border rounded-xl p-[15px_16px]">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted">Asistidas</div>
              <div className="font-display font-extrabold text-2xl text-brand-text tz-nums mt-1">{stats.attended}</div>
            </div>
            <div className="border border-brand-border rounded-xl p-[15px_16px]">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted">No-shows</div>
              <div className="font-display font-extrabold text-2xl text-critical tz-nums mt-1">{stats.noShow}</div>
            </div>
            <div className="border border-brand-border rounded-xl p-[15px_16px]">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted">Tasa de no-show</div>
              <div className="font-display font-extrabold text-2xl text-brand-text tz-nums mt-1">
                {stats.noShowRate} %
              </div>
            </div>
          </div>

          <AddNoteForm memberId={member.id} />

          <ActivityThread entries={threadEntries} />
        </>
      ),
    },
    {
      key: "entreno",
      label: "Entrenamiento",
      meta: railMeta.entreno,
      content: (
        <>
          <SectionHead
            title="Entrenamiento"
            description="Objetivos, mesociclo en curso y valoraciones que lo alimentan."
          />

          <div>
            <SubHead title="Objetivos" />
            <ClientGoalsPanel memberId={member.id} goals={member.clientGoals} templates={goalTemplates} />
            {canManageOrg(session.user.role) && (
              <div className="pt-3 mt-4 border-t border-brand-subtle-2">
                <p className="text-[11px] text-brand-faint mb-2">
                  Catálogo de objetivos (editable sin desplegar código)
                </p>
                <GoalTemplateForm />
              </div>
            )}
          </div>

          {/* F6: el mesociclo es material del entrenador — no se expone en el
              portal del socio ni en la app móvil. */}
          {canSeeMesocycles && (
            <div>
              <SubHead title="Mesociclo en curso" />
              {currentMesocycle ? (
                <div className="bg-brand-bg border border-brand-border rounded-[14px] p-[18px_20px] mb-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-brand-text">{currentMesocycle.title}</div>
                      <div className="text-xs text-brand-muted tz-nums mt-1">
                        Creado {fmtDay(currentMesocycle.createdAt)}
                        {currentMesocycle.approvedAt ? ` · aprobado ${fmtDay(currentMesocycle.approvedAt)}` : ""}
                      </div>
                    </div>
                    <Badge tone={MESOCYCLE_STATUS_TONE[currentMesocycle.status] ?? "neutral"}>
                      {MESOCYCLE_STATUS_LABEL[currentMesocycle.status] ?? currentMesocycle.status}
                    </Badge>
                  </div>
                  <Link
                    href={`/members/${member.id}/mesociclos/${currentMesocycle.id}`}
                    className="inline-block mt-3.5 text-sm font-semibold text-brand-text hover:underline"
                  >
                    Ver plan de la semana →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-brand-muted mb-4">Este socio no tiene todavía ningún mesociclo.</p>
              )}
              <MesocyclePanel memberId={member.id} mesocycles={mesocycles} aiConfigured={isAiConfigured()} />
            </div>
          )}

          {canSeeAssessments && (
            <div>
              <SubHead
                title="Valoraciones"
                action={
                  <Link
                    href={`/members/${member.id}/valoraciones`}
                    className="text-sm font-semibold text-brand-text hover:underline"
                  >
                    Gestionar →
                  </Link>
                }
              />
              {assessments.length === 0 ? (
                <p className="text-sm text-brand-muted bg-brand-bg border border-brand-border rounded-xl p-4">
                  Este socio todavía no tiene ninguna valoración.
                </p>
              ) : (
                <ul className="list-none flex flex-col gap-2">
                  {assessments.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/members/${member.id}/valoraciones/${a.id}`}
                        className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-brand-border p-[13px_16px] hover:border-brand-ink transition-colors duration-200"
                      >
                        <span className="text-sm font-semibold">{ASSESSMENT_KIND_LABEL[a.kind]}</span>
                        <span className="flex items-center gap-3 text-xs text-brand-muted tz-nums">
                          {a.completedAt ? (
                            <>
                              <span>{fmtDay(a.completedAt)}</span>
                              <Badge tone="good">Completada</Badge>
                            </>
                          ) : (
                            <>
                              <span>Vence {fmtDay(a.dueDate)}</span>
                              <Badge tone="warning">Pendiente</Badge>
                            </>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-brand-faint mt-2.5">
                La valoración inicial firma el PAR-Q y propaga el screening al Semáforo de Aptitud y al Session
                Brief. Las revisiones (1, 3, 6, 9 meses y aniversario) repiten las mismas constantes para poder
                graficarlas.
              </p>
            </div>
          )}
        </>
      ),
    },
    {
      key: "evolucion",
      label: "Evolución",
      meta: railMeta.evolucion,
      content: (
        <>
          {member.consentHealth || member.consentImages ? (
            <SectionHeadDisclosure
              title="Evolución"
              items={[
                ...(member.consentHealth
                  ? [
                      {
                        key: "tanita",
                        label: "Pegar Tanita",
                        variant: "secondary" as const,
                        content: <TanitaPasteImportForm memberId={member.id} />,
                      },
                    ]
                  : []),
                {
                  key: "toma",
                  label: "Nueva toma",
                  variant: "primary" as const,
                  content: <AddProgressEntryForm memberId={member.id} />,
                },
              ]}
            />
          ) : (
            <>
              <SectionHead title="Evolución" description="Composición corporal y fotos de progreso." />
              <div className="text-sm text-brand-muted bg-brand-bg border border-brand-border rounded-xl p-4">
                Este socio no ha firmado ni el consentimiento de datos de salud ni el de uso de imágenes. No se
                pueden guardar métricas de composición ni fotos de evolución hasta que otorgue alguno en su
                onboarding.
              </div>
            </>
          )}

          {!member.consentImages && member.consentHealth && (
            <p className="text-[11px] text-brand-faint">
              Sin consentimiento de imágenes: solo se pueden guardar métricas (peso, composición), no fotos.
            </p>
          )}

          <CompositionSummary tiles={compositionTiles} measuredAt={measuredAt} />

          <div className="border border-brand-border rounded-[14px] p-[18px_20px]">
            <h3 className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-text mb-3">
              Composición corporal
            </h3>
            <BodyCompositionChart points={compositionChartPoints} />
          </div>

          <div className="border border-brand-border rounded-[14px] p-[18px_20px]">
            <h3 className="text-[13px] font-bold uppercase tracking-[.08em] text-brand-text mb-3">
              Porcentaje graso
            </h3>
            <SingleMetricChart points={bodyFatChartPoints} unit="%" />
          </div>

          {member.progressEntries.length === 0 ? (
            <p className="text-sm text-brand-muted">Sin registros de evolución todavía.</p>
          ) : (
            <>
              {member.progressEntries.map((entry) => (
                <div key={entry.id} className="border border-brand-border rounded-[14px] p-[18px_20px]">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
                    <div className="font-bold text-[15px] text-brand-text tz-nums flex items-center gap-2">
                      {fmtDay(entry.measuredAt ?? entry.date)}
                      {entry.source === "TANITA" && (
                        <Badge tone="neutral" dot={false}>
                          Tanita
                        </Badge>
                      )}
                      {!member.consentImages && (
                        <Badge tone="warning" dot={false}>
                          Sin consentimiento de imágenes
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {entry.weightKg != null && (
                        <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">
                          {entry.weightKg} kg
                        </span>
                      )}
                      {entry.bodyFatPct != null && (
                        <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">
                          {entry.bodyFatPct} % graso
                        </span>
                      )}
                      {entry.muscleMassKg != null && (
                        <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">
                          {entry.muscleMassKg} kg músculo
                        </span>
                      )}
                      {entry.waistCm != null && (
                        <span className="rounded-pill bg-tz-sand px-3 py-1 text-xs font-semibold text-text-2 tz-nums">
                          {entry.waistCm} cm cintura
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {[
                      { url: entry.photoFrontUrl, label: "Frente" },
                      { url: entry.photoSideUrl, label: "Perfil" },
                      { url: entry.photoBackUrl, label: "Espalda" },
                    ].map((slot) => (
                      <div key={slot.label}>
                        <div className="h-[210px] rounded-xl border border-brand-border overflow-hidden flex items-center justify-center">
                          {slot.url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- foto de evolución subida por el usuario
                            <img src={slot.url} alt={slot.label} className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{
                                backgroundImage:
                                  "repeating-linear-gradient(135deg,var(--color-tz-bone) 0 10px,var(--color-tz-sand) 10px 20px)",
                              }}
                            >
                              <span className="font-mono text-[11px] text-brand-muted">
                                {member.consentImages ? "Sin foto" : "Bloqueado"}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted mt-2 text-center">
                          {slot.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <ProgressComparator entries={member.progressEntries} />
            </>
          )}
        </>
      ),
    },
  ];

  const header = (
    <div className="bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden">
      <div className="flex items-start justify-between gap-5 flex-wrap p-6 pl-[26px]">
        <div className="flex items-center gap-[18px] min-w-0">
          <EditableMemberPhoto
            memberId={member.id}
            photoUrl={member.photoUrl}
            initials={initials(member.firstName, member.lastName)}
          />
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-[27px] uppercase tracking-[-.015em] text-brand-text leading-none">
              {member.firstName} {member.lastName}
            </h1>
            <p className="text-[13px] text-brand-muted mt-2">
              {member.email} · {member.primaryCenter.name} · Alta {fmtDay(member.joinedAt)}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
              {serviceKinds.map((k) => (
                <Badge key={k} tone="neutral" dot={false}>
                  {SERVICE_KIND_LABEL[k]}
                </Badge>
              ))}
              <Badge tone={MEMBER_STATE_TONE[member.state]}>{MEMBER_STATE_LABEL[member.state]}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!member.userId && <ResendWelcomeButton memberId={member.id} />}
          <EditMemberDataButton />
          <NewNoteButton />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-brand-subtle-2 bg-brand-bg">
        <Metric position={0} label="Antigüedad" value={seniority(member.joinedAt)} foot={`Alta ${fmtDay(member.joinedAt)}`} />
        <Metric
          position={1}
          label="Sesiones restantes"
          value={
            manageableSubscriptions.length === 0 ? (
              "—"
            ) : unlimitedBono ? (
              "Ilimitadas"
            ) : (
              <>
                {remainingTotal}
                {includedTotal > 0 && (
                  <span className="text-[13px] font-semibold text-brand-muted"> / {includedTotal}</span>
                )}
              </>
            )
          }
          foot={activeSubscriptionSummary ?? "Sin bono activo"}
        />
        <Metric
          position={2}
          label="Asistencia"
          value={stats.attended}
          foot={`${stats.attended === 1 ? "sesión" : "sesiones"} · ${stats.noShow} no-shows`}
        />
        <Metric
          position={3}
          label="Próxima sesión"
          value={nextBooking ? fmtShortDay(nextBooking.occurrenceDate) : "—"}
          foot={nextBooking ? `${nextBooking.session.startTime} · ${nextBooking.session.name}` : "Sin reservas"}
        />
      </div>
    </div>
  );

  const initial = sections.some((s) => s.key === initialSection)
    ? (initialSection as SectionKey)
    : undefined;

  return (
    <div className="tz-page flex flex-col gap-4">
      <SectionRail sections={sections} initial={initial} header={header} />
    </div>
  );
}

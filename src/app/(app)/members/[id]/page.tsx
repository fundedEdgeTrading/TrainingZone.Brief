import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
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
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE, PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { canAdjustSessionBalance, canDeleteMembers, canManageOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import Tabs from "./tabs";
import { AddHealthRecordForm, ResolveHealthButton, AddNoteForm, ResendWelcomeButton } from "./member-forms";
import { MemberDataPanel } from "./member-data-panel";
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
import { canAccessMemberChat, getOrCreateConversation, listMessages } from "@/lib/chat";
import { listWorkoutPrograms } from "@/lib/workout-programs";
import { StaffChatThread } from "./staff-chat-thread";
import { WorkoutProgramList } from "./workout-panel";
import { SingleMetricChart } from "@/components/single-metric-chart";
import { BonosPanel } from "./bonos-panel";
import { MemberSessionsCalendar } from "./member-calendar";

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

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  PAID: "text-good",
  PENDING: "text-warning",
  FAILED: "text-critical",
  REFUNDED: "text-muted",
};

const FEELING_DOT: Record<string, string> = { GREEN: "bg-good", AMBER: "bg-warning", RED: "bg-critical" };

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

function sessionsLabel(sessionsRemaining: number | null) {
  return sessionsRemaining == null ? "Ilimitadas" : `${sessionsRemaining}`;
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const { id } = await params;

  const member = await getMemberDetail(session.user.orgId, id);
  if (!member) notFound();

  const [stats, healthRecords, notes, goalTemplates, centers, plans] = await Promise.all([
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
  ]);

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));
  // RB-AGENDA-003: un socio puede tener varios bonos ACTIVE/FROZEN a la vez
  // (EP y grupos, en centros distintos) — la pestaña "Contratación" gestiona
  // cada uno por separado, no solo el primero.
  const manageableSubscriptions = member.subscriptions.filter((s) => s.status === "ACTIVE" || s.status === "FROZEN");
  const activeSubscriptionSummary =
    manageableSubscriptions.length === 0
      ? null
      : manageableSubscriptions.length === 1
        ? manageableSubscriptions[0].plan.name
        : `${manageableSubscriptions.length} bonos activos`;
  const canManageSub = canManageBilling(session.user.role);
  const canDelete = canDeleteMembers(session.user.role);

  // Pestaña "Bonos y calendario". El mes en curso sale de la zona del CENTRO y
  // no de `new Date()` del servidor (UTC): el día 1 a medianoche en España
  // abriría el mes anterior (mismo fallo ya corregido en /agenda).
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

  const canChat = await canAccessMemberChat(session.user.orgId, member.id, session.user.id, session.user.role);
  const [chatMessages, workoutPrograms] = await Promise.all([
    canChat
      ? getOrCreateConversation(session.user.orgId, member.id).then((c) => listMessages(c.id))
      : Promise.resolve([]),
    listWorkoutPrograms(session.user.orgId, member.id),
  ]);

  // CC1.4/CC2/CC3 (docs/COMPOSICION_CORPORAL_IMPLEMENTACION.md): última toma con semáforo +
  // serie para la gráfica de evolución. Rango de referencia sin filtro de sexo (dato no
  // capturado hoy — ver §8.1 "riesgos abiertos" del doc de composición).
  const { compositionTiles, compositionChartPoints, bodyFatChartPoints, measuredAt } = await buildCompositionView(
    session.user.orgId,
    member.birthDate,
    member.progressEntries
  );

  return (
    <div className="tz-page space-y-4">
      <div className="bg-brand-card border border-brand-border rounded-card p-6 shadow-card flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <EditableMemberPhoto memberId={member.id} photoUrl={member.photoUrl} initials={initials(member.firstName, member.lastName)} />
          <div>
            <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text leading-none">
              {member.firstName} {member.lastName}
            </h1>
            <p className="text-sm text-brand-muted mt-1.5">
              {member.email} · {member.primaryCenter.name} · Alta {member.joinedAt.toLocaleDateString("es-ES")}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {serviceKinds.map((k) => (
                <Badge key={k} tone="neutral" dot={false}>
                  {SERVICE_KIND_LABEL[k]}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!member.userId && <ResendWelcomeButton memberId={member.id} />}
          <Badge tone={MEMBER_STATE_TONE[member.state]}>{MEMBER_STATE_LABEL[member.state]}</Badge>
        </div>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-card p-5 shadow-card">
        <Tabs
          panels={[
            {
              key: "datos",
              label: "Datos",
              content: (
                <MemberDataPanel
                  centers={centers}
                  stats={{ attended: stats.attended, noShow: stats.noShow }}
                  activeSubscriptionPlan={activeSubscriptionSummary}
                  canDelete={canDelete}
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
                  }}
                />
              ),
            },
            {
              key: "evolucion",
              label: "Fotos y evolución",
              content: (
                <div className="space-y-6">
                  {member.consentHealth || member.consentImages ? (
                    <div className="space-y-3">
                      <AddProgressEntryForm memberId={member.id} />
                      {member.consentHealth && <TanitaPasteImportForm memberId={member.id} />}
                    </div>
                  ) : (
                    <div className="text-sm text-muted bg-tz-bone border border-tz-linen rounded-lg p-4">
                      Este socio no ha firmado ni el consentimiento de datos de salud ni el de uso de imágenes. No
                      se pueden guardar métricas de composición ni fotos de evolución hasta que otorgue alguno en
                      su onboarding.
                    </div>
                  )}
                  {!member.consentImages && member.consentHealth && (
                    <p className="text-xs text-brand-muted">
                      Sin consentimiento de imágenes: solo se pueden guardar métricas (peso, composición), no fotos.
                    </p>
                  )}

                  <CompositionSummary tiles={compositionTiles} measuredAt={measuredAt} />
                  <BodyCompositionChart points={compositionChartPoints} />
                  <SingleMetricChart points={bodyFatChartPoints} unit="%" />

                  {member.progressEntries.length === 0 ? (
                    <p className="text-sm text-muted">Sin registros de evolución todavía.</p>
                  ) : (
                    <div className="space-y-4">
                      {member.progressEntries.map((entry) => (
                        <div key={entry.id} className="border border-tz-linen rounded-xl p-5">
                          <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
                            <div className="font-bold text-[15px] text-tz-black flex items-center gap-2">
                              {(entry.measuredAt ?? entry.date).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                              {entry.source === "TANITA" && (
                                <span className="rounded-pill bg-tz-black text-tz-bone px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
                                  Tanita
                                </span>
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
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                              { url: entry.photoFrontUrl, label: "Frente" },
                              { url: entry.photoSideUrl, label: "Perfil" },
                              { url: entry.photoBackUrl, label: "Espalda" },
                            ].map((slot) => (
                              <div key={slot.label}>
                                <div className="h-[200px] rounded-xl bg-tz-bone border border-tz-linen overflow-hidden flex items-center justify-center">
                                  {slot.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- foto de evolución subida por el usuario
                                    <img src={slot.url} alt={slot.label} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs text-faint">Sin foto</span>
                                  )}
                                </div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mt-2 text-center">
                                  {slot.label}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <ProgressComparator entries={member.progressEntries} />
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "contratacion",
              label: "Contratación",
              content: (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-semibold text-muted uppercase mb-2">Suscripciones</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-faint text-left">
                          <tr>
                            <th className="pb-2">Plan</th>
                            <th className="pb-2">Centro</th>
                            <th className="pb-2">Inicio</th>
                            <th className="pb-2">Fin</th>
                            <th className="pb-2">Estado</th>
                            <th className="pb-2">Precio</th>
                            <th className="pb-2">Congelación</th>
                            <th className="pb-2">Baja programada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {member.subscriptions.map((s) => (
                            <tr key={s.id} className="border-t border-tz-sand">
                              <td className="py-2">{s.plan.name}</td>
                              <td className="py-2 text-text-2">{s.center.name}</td>
                              <td className="py-2">{s.startDate.toLocaleDateString("es-ES")}</td>
                              <td className="py-2">{s.endDate ? s.endDate.toLocaleDateString("es-ES") : "—"}</td>
                              <td className="py-2">{s.status}</td>
                              <td className="py-2 tz-nums">{euros(s.priceCents)}</td>
                              <td className="py-2 text-text-2">
                                {s.status === "FROZEN" ? (s.pauseUntil ? `hasta ${s.pauseUntil.toLocaleDateString("es-ES")}` : "indefinida") : "—"}
                              </td>
                              <td className="py-2 text-text-2">{s.cancelAt ? s.cancelAt.toLocaleDateString("es-ES") : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {canManageSub && (
                    <div className="space-y-4">
                      {manageableSubscriptions.map((s) => (
                        <div key={s.id} className="border border-tz-linen rounded-lg p-4 space-y-5 bg-tz-bone/40">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h4 className="text-xs font-semibold text-muted uppercase">
                              Gestión de bono · {s.plan.name}
                            </h4>
                            <div className="flex items-center gap-2">
                              <Badge tone="neutral" dot={false}>
                                {s.center.name}
                              </Badge>
                              <span className="text-xs text-brand-muted tz-nums">{sessionsLabel(s.sessionsRemaining)} sesiones</span>
                            </div>
                          </div>

                          {s.status === "ACTIVE" ? (
                            <FreezeSubscriptionForm subscriptionId={s.id} />
                          ) : (
                            <ResumeSubscriptionButton subscriptionId={s.id} memberId={member.id} />
                          )}

                          <UpdateSubscriptionPriceForm subscriptionId={s.id} />

                          {s.cancelAt ? (
                            <CancelScheduledCancellationButton subscriptionId={s.id} memberId={member.id} />
                          ) : (
                            <ScheduleCancellationForm subscriptionId={s.id} />
                          )}
                        </div>
                      ))}

                      <div className="border border-tz-linen rounded-lg p-4 space-y-3 bg-tz-bone/40">
                        <p className="text-xs font-semibold text-muted uppercase">Añadir bono</p>
                        <AddSubscriptionForm memberId={member.id} plans={plans} centers={centers} />
                      </div>

                      <div className="pt-1 border-t border-tz-sand">
                        <p className="text-xs text-brand-muted mb-2">Venta puntual (RB-PAGO-005)</p>
                        <AddOneOffProductForm memberId={member.id} />
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-semibold text-muted uppercase mb-2">Pagos recientes</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-faint text-left">
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
                            <tr key={p.id} className="border-t border-tz-sand">
                              <td className="py-2">{p.date.toLocaleDateString("es-ES")}</td>
                              <td className="py-2 tz-nums">{euros(p.amountCents)}</td>
                              <td className="py-2">{PAYMENT_METHOD_LABEL[p.method]}</td>
                              <td className="py-2">
                                <span className={PAYMENT_STATUS_CLASS[p.status]}>{p.status}</span>
                              </td>
                              <td className="py-2 text-faint">{p.receiptNumber}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "bonos-calendario",
              label: "Bonos y calendario",
              content: (
                <div className="space-y-6">
                  <BonosPanel
                    canAdjust={canAdjustSessionBalance(session.user.role)}
                    balances={sessionBalances}
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
                </div>
              ),
            },
            {
              key: "asistencia",
              label: "Asistencia",
              content: (
                <div className="space-y-4">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <div className="font-display font-extrabold text-2xl text-tz-black tz-nums">{stats.attended}</div>
                      <div className="text-muted">Sesiones asistidas</div>
                    </div>
                    <div>
                      <div className="font-display font-extrabold text-2xl text-critical tz-nums">{stats.noShow}</div>
                      <div className="text-muted">No-shows</div>
                    </div>
                    <div>
                      <div className="font-display font-extrabold text-2xl text-tz-black tz-nums">{stats.noShowRate}%</div>
                      <div className="text-muted">Tasa de no-show</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-faint text-left">
                        <tr>
                          <th className="pb-2">Fecha</th>
                          <th className="pb-2">Clase</th>
                          <th className="pb-2">Estado</th>
                          <th className="pb-2">Debrief</th>
                        </tr>
                      </thead>
                      <tbody>
                        {member.bookings.map((b) => (
                          <tr key={b.id} className="border-t border-tz-sand">
                            <td className="py-2">{b.session.date.toLocaleDateString("es-ES")}</td>
                            <td className="py-2">{b.session.name}</td>
                            <td className="py-2">{b.status}</td>
                            <td className="py-2">
                              {b.debrief ? (
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${FEELING_DOT[b.debrief.feeling]}`} />
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            },
            {
              key: "bitacora",
              label: "Bitácora",
              content: (
                <div className="space-y-4 max-w-2xl">
                  <AddNoteForm memberId={member.id} />
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted">Sin observaciones todavía.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {notes.map((n) => (
                        <li key={n.id} className="border border-tz-linen rounded-lg p-3 text-sm">
                          <p className="text-text-2 whitespace-pre-wrap">{n.body}</p>
                          <p className="text-xs text-faint mt-1.5">
                            {n.author?.name ?? "—"} ·{" "}
                            {n.createdAt.toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            },
            {
              key: "objetivos",
              label: "Objetivos",
              content: (
                <div className="space-y-4">
                  <ClientGoalsPanel memberId={member.id} goals={member.clientGoals} templates={goalTemplates} />
                  {canManageOrg(session.user.role) && (
                    <div className="pt-3 border-t border-tz-sand">
                      <p className="text-xs text-brand-muted mb-2">Catálogo de objetivos (editable sin desplegar código)</p>
                      <GoalTemplateForm />
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "ia-chat",
              label: "IA & Chat",
              content: (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-semibold text-muted uppercase mb-2">Rutina de IA (RB-IA-001/003)</h4>
                    <WorkoutProgramList memberId={member.id} programs={workoutPrograms} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-muted uppercase mb-2">Chat (RB-CHAT-001)</h4>
                    {canChat ? (
                      <StaffChatThread
                        memberId={member.id}
                        messages={chatMessages.map((m) => ({ id: m.id, senderKind: m.senderKind, senderName: m.sender?.name ?? null, body: m.body, createdAt: m.createdAt }))}
                      />
                    ) : (
                      <p className="text-sm text-muted bg-tz-bone border border-tz-linen rounded-lg p-4">
                        Solo el entrenador que ha impartido sesiones recientes a este socio y dirección pueden ver este chat.
                      </p>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: "salud",
              label: "Salud",
              content: healthRecords === null ? (
                <div className="text-sm text-muted bg-tz-bone border border-tz-linen rounded-lg p-4">
                  Acceso restringido: tu rol no tiene permiso para ver datos de salud
                  de este socio (Art. 9 RGPD — acceso limitado al equipo del centro
                  y dirección). Ver <span className="italic">Auditoría</span> para el registro de accesos.
                </div>
              ) : (
                <div className="space-y-4">
                  {member.consentHealth ? (
                    <AddHealthRecordForm memberId={member.id} />
                  ) : (
                    <div className="text-sm text-muted bg-tz-bone border border-tz-linen rounded-lg p-4">
                      Este socio no ha firmado el consentimiento de datos de salud
                      (Art. 9 RGPD). No se pueden registrar lesiones ni condiciones
                      hasta que lo otorgue.
                    </div>
                  )}
                  {healthRecords.length === 0 ? (
                    <p className="text-sm text-muted">Sin registros de salud.</p>
                  ) : (
                    <div className="space-y-3">
                      {healthRecords.map((h) => (
                        <div key={h.id} className="border border-tz-linen rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-tz-black">
                              {HEALTH_TYPE_LABEL[h.type]}
                              {h.zone ? ` — ${h.zone}` : ""}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              {h.status === "ACTIVE" && (
                                <ResolveHealthButton recordId={h.id} memberId={member.id} />
                              )}
                              <Badge tone={h.status === "ACTIVE" ? "warning" : "neutral"} dot={false}>
                                {h.status === "ACTIVE" ? "Activa" : "Resuelta"}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-text-2 mt-1">{h.description}</p>
                          <p className="text-xs text-faint mt-1">
                            Severidad: {SEVERITY_LABEL[h.severity]} · Reportado por{" "}
                            {h.reportedBy?.name ?? "—"} el {h.reportedAt.toLocaleDateString("es-ES")}
                          </p>
                        </div>
                      ))}
                      <p className="text-xs text-faint">
                        Cada lectura y alta queda registrada en el log de auditoría (ADR-008).
                      </p>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

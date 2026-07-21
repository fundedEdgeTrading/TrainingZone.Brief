import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import {
  getMemberDetail,
  getMemberAttendanceStats,
  getMemberNotes,
  getMemberServiceKinds,
  listClientGoalTemplates,
} from "@/lib/members-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { getHealthRecordsForMember } from "@/lib/health-access";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE, PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { canManageOrg } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import Tabs from "./tabs";
import { AddHealthRecordForm, ResolveHealthButton, AddNoteForm, ContactForm, ResendWelcomeButton } from "./member-forms";
import { EditableMemberPhoto } from "./member-photo";
import { AddProgressEntryForm, ProgressComparator } from "./progress-forms";
import { ClientGoalsPanel, GoalTemplateForm, TrainerAssignSelect } from "./member-profile-forms";
import { canAccessMemberChat, getOrCreateConversation, listMessages } from "@/lib/chat";
import { listWorkoutPrograms } from "@/lib/workout-programs";
import { StaffChatThread } from "./staff-chat-thread";
import { WorkoutProgramList } from "./workout-panel";

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

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const { id } = await params;

  const member = await getMemberDetail(session.user.orgId, id);
  if (!member) notFound();

  const [stats, healthRecords, notes, trainers, goalTemplates] = await Promise.all([
    getMemberAttendanceStats(member.id),
    getHealthRecordsForMember({
      memberId: member.id,
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    }),
    getMemberNotes(session.user.orgId, member.id),
    listAssignableStaff(session.user.orgId, ["TRAINER"]),
    listClientGoalTemplates(session.user.orgId),
  ]);

  const serviceKinds = getMemberServiceKinds(member.subscriptions.map((s) => ({ status: s.status, plan: { type: s.plan.type } })));

  const canChat = await canAccessMemberChat(session.user.orgId, member.id, session.user.id, session.user.role);
  const [chatMessages, workoutPrograms] = await Promise.all([
    canChat
      ? getOrCreateConversation(session.user.orgId, member.id).then((c) => listMessages(c.id))
      : Promise.resolve([]),
    listWorkoutPrograms(session.user.orgId, member.id),
  ]);

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
              <span className="text-xs text-brand-muted-2">
                {member.trainer ? `Entrenador: ${member.trainer.name}` : "Responsable: Training Zone"}
              </span>
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
                <div className="space-y-6">
                  <ContactForm
                    member={{
                      id: member.id,
                      email: member.email,
                      phone: member.phone,
                      address: member.address,
                      birthDate: member.birthDate ? member.birthDate.toISOString().slice(0, 10) : null,
                      emergencyContact: member.emergencyContact,
                      consentContractAt: member.consentContractAt ? member.consentContractAt.toISOString() : null,
                      consentHealthAt: member.consentHealthAt ? member.consentHealthAt.toISOString() : null,
                      consentImagesAt: member.consentImagesAt ? member.consentImagesAt.toISOString() : null,
                      consentMarketingAt: member.consentMarketingAt ? member.consentMarketingAt.toISOString() : null,
                    }}
                  />
                  <div className="max-w-md">
                    <TrainerAssignSelect memberId={member.id} trainerId={member.trainerId} trainers={trainers} />
                  </div>
                </div>
              ),
            },
            {
              key: "evolucion",
              label: "Fotos y evolución",
              content: (
                <div className="space-y-6">
                  {member.consentImages ? (
                    <AddProgressEntryForm memberId={member.id} />
                  ) : (
                    <div className="text-sm text-muted bg-tz-bone border border-tz-linen rounded-lg p-4">
                      Este socio no ha firmado el consentimiento de uso de imágenes. No se pueden guardar fotos de
                      evolución hasta que lo otorgue en su onboarding.
                    </div>
                  )}
                  {member.progressEntries.length === 0 ? (
                    <p className="text-sm text-muted">Sin registros de evolución todavía.</p>
                  ) : (
                    <div className="space-y-4">
                      {member.progressEntries.map((entry) => (
                        <div key={entry.id} className="border border-tz-linen rounded-xl p-5">
                          <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
                            <div className="font-bold text-[15px] text-tz-black">
                              {entry.date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
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
                    <table className="w-full text-sm">
                      <thead className="text-xs text-faint text-left">
                        <tr>
                          <th className="pb-2">Plan</th>
                          <th className="pb-2">Inicio</th>
                          <th className="pb-2">Fin</th>
                          <th className="pb-2">Estado</th>
                          <th className="pb-2">Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {member.subscriptions.map((s) => (
                          <tr key={s.id} className="border-t border-tz-sand">
                            <td className="py-2">{s.plan.name}</td>
                            <td className="py-2">{s.startDate.toLocaleDateString("es-ES")}</td>
                            <td className="py-2">{s.endDate ? s.endDate.toLocaleDateString("es-ES") : "—"}</td>
                            <td className="py-2">{s.status}</td>
                            <td className="py-2 tz-nums">{euros(s.priceCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-muted uppercase mb-2">Pagos recientes</h4>
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
                        Solo el entrenador asignado y dirección pueden ver este chat.
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
                  de este socio (Art. 9 RGPD — acceso limitado a entrenador
                  asignado y dirección). Ver <span className="italic">Auditoría</span> para el registro de accesos.
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

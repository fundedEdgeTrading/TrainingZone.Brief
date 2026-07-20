import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberDetail, getMemberAttendanceStats, getMemberNotes } from "@/lib/members-queries";
import { getHealthRecordsForMember } from "@/lib/health-access";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE, PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { Badge } from "@/components/ui/badge";
import Tabs from "./tabs";
import { AddHealthRecordForm, ResolveHealthButton, AddNoteForm } from "./member-forms";

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

  const [stats, healthRecords, notes] = await Promise.all([
    getMemberAttendanceStats(member.id),
    getHealthRecordsForMember({
      memberId: member.id,
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    }),
    getMemberNotes(session.user.orgId, member.id),
  ]);

  return (
    <div className="tz-page space-y-4">
      <div className="bg-brand-card border border-brand-border rounded-card p-6 shadow-card flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-tz-sand text-brand-text-2 font-display font-extrabold text-lg flex items-center justify-center shrink-0">
            {initials(member.firstName, member.lastName)}
          </span>
          <div>
            <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text leading-none">
              {member.firstName} {member.lastName}
            </h1>
            <p className="text-sm text-brand-muted mt-1.5">
              {member.email} · {member.primaryCenter.name}
            </p>
          </div>
        </div>
        <Badge tone={MEMBER_STATE_TONE[member.state]}>{MEMBER_STATE_LABEL[member.state]}</Badge>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-card p-5 shadow-card">
        <Tabs
          panels={[
            {
              key: "datos",
              label: "Datos",
              content: (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm max-w-xl">
                  <dt className="text-muted">Teléfono</dt>
                  <dd className="text-tz-black">{member.phone ?? "—"}</dd>
                  <dt className="text-muted">Fecha de nacimiento</dt>
                  <dd className="text-tz-black">
                    {member.birthDate ? member.birthDate.toLocaleDateString("es-ES") : "—"}
                  </dd>
                  <dt className="text-muted">Alta</dt>
                  <dd className="text-tz-black">{member.joinedAt.toLocaleDateString("es-ES")}</dd>
                  <dt className="text-muted">Baja</dt>
                  <dd className="text-tz-black">
                    {member.cancelledAt ? member.cancelledAt.toLocaleDateString("es-ES") : "—"}
                  </dd>
                  <dt className="text-muted">Consentimiento contrato</dt>
                  <dd className="text-tz-black">{member.consentContract ? "Sí" : "No"}</dd>
                  <dt className="text-muted">Consentimiento datos de salud</dt>
                  <dd className="text-tz-black">{member.consentHealth ? "Sí" : "No"}</dd>
                  <dt className="text-muted">Consentimiento marketing</dt>
                  <dd className="text-tz-black">{member.consentMarketing ? "Sí" : "No"}</dd>
                </dl>
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

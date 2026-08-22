import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { getLeadDetail, listNoCloseReasons, leadIsArchived } from "@/lib/leads-queries";
import { getHealthRecordsForLead } from "@/lib/health-access";
import { canViewHealthData } from "@/lib/rbac";
import { listAssignableStaff } from "@/lib/org-queries";
import { listActivePlansForOrg } from "@/lib/members-queries";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  StageButtons,
  OwnerAssignForm,
  NoCloseForm,
  LeadNoteForm,
  ConvertLeadForm,
} from "./lead-detail-actions";

const STATUS_LABEL: Record<string, string> = {
  SIN_CONTACTAR: "Sin contactar",
  SEGUIMIENTO: "Seguimiento",
  CON_FECHA_VALORACION: "Con fecha de valoración",
  CERRADO: "Cerrado",
  NO_CERRADO: "No cerrado",
};

const CLOSE_TYPE_LABEL: Record<string, string> = { EMBUDO: "Embudo", DIRECTO: "Directo", ONLINE: "Online" };
const CLOSE_TYPE_TONE: Record<string, "neutral" | "trial" | "gold"> = { EMBUDO: "neutral", DIRECTO: "trial", ONLINE: "gold" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const { id } = await params;

  const lead = await getLeadDetail(session.user.orgId, id);
  if (!lead) notFound();

  const canSeeHealth = canViewHealthData(session.user.role);
  const [healthRecords, reasons, staff, plans] = await Promise.all([
    canSeeHealth
      ? getHealthRecordsForLead({ leadId: id, orgId: session.user.orgId, actorUserId: session.user.id, actorRole: session.user.role })
      : Promise.resolve(null),
    listNoCloseReasons(session.user.orgId),
    listAssignableStaff(session.user.orgId, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]),
    listActivePlansForOrg(session.user.orgId),
  ]);

  const archived = leadIsArchived(lead.status);
  const age = Math.round((new Date().getTime() - lead.contactedAt.getTime()) / (24 * 60 * 60 * 1000));

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <Badge tone={lead.status === "CERRADO" ? "good" : lead.status === "NO_CERRADO" ? "critical" : "neutral"}>
              {STATUS_LABEL[lead.status]}
            </Badge>
            {lead.status === "CERRADO" && lead.closeType && (
              <Badge tone={CLOSE_TYPE_TONE[lead.closeType]} dot={false}>
                Cierre {CLOSE_TYPE_LABEL[lead.closeType]}
              </Badge>
            )}
            <span className="text-brand-muted text-sm">Contactado hace {age} día(s) · {lead.center.name}</span>
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title={`${lead.firstName} ${lead.lastName}`} meta={lead.channel}>
            {/* En móvil, una columna: un email largo no parte por espacios y
                desbordaba la mitad de la rejilla. */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm [&_dd]:break-words">
              <div>
                <dt className="text-xs text-brand-muted">Teléfono</dt>
                <dd className="text-brand-text">{lead.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-muted">Email</dt>
                <dd className="text-brand-text">{lead.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-muted">Código postal</dt>
                <dd className="text-brand-text tz-nums">{lead.postalCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-muted">Ocupación</dt>
                <dd className="text-brand-text">{lead.occupation}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-brand-muted">Objetivos</dt>
                <dd className="text-brand-text">{lead.goals}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-brand-muted">¿Ha entrenado antes?</dt>
                <dd className="text-brand-text">{lead.hasTrainedBefore ? "Sí" : "No"}{lead.hasTrainedNote ? ` — ${lead.hasTrainedNote}` : ""}</dd>
              </div>
              {lead.noCloseReason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-brand-muted">Motivo de no cierre</dt>
                  <dd className="text-critical">{lead.noCloseReason}</dd>
                </div>
              )}
            </dl>
          </Card>

          {canSeeHealth && healthRecords && (
            <Card title="Salud (Art. 9 RGPD)" meta="acceso restringido y auditado">
              {healthRecords.length === 0 ? (
                <p className="text-sm text-brand-muted">Sin registros.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {healthRecords.map((r) => (
                    <li key={r.id} className="border-t border-tz-sand pt-2 first:border-0 first:pt-0">
                      {r.description}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Bitácora" meta={`${lead.notes.length} notas`}>
            <div className="space-y-3">
              <LeadNoteForm leadId={lead.id} />
              <ul className="space-y-2 text-sm">
                {lead.notes.map((n) => (
                  <li key={n.id} className="border-t border-tz-sand pt-2 first:border-0 first:pt-0">
                    <p className="text-brand-text">{n.body}</p>
                    <p className="text-xs text-faint mt-0.5">
                      {n.author?.name ?? "Sistema"} · {n.createdAt.toLocaleString("es-ES")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {!archived && (
            <Card title="Gestión del lead">
              <div className="space-y-4">
                <OwnerAssignForm leadId={lead.id} staff={staff} ownerUserId={lead.ownerUserId} />
                <StageButtons leadId={lead.id} status={lead.status} />
              </div>
            </Card>
          )}

          {lead.convertedMember ? (
            lead.status === "CERRADO" ? (
              <div className="rounded-2xl p-[22px] bg-good-bg border border-good/20">
                <h3 className="font-display font-extrabold text-base uppercase tracking-[.01em] text-good mb-2">Cliente dado de alta</h3>
                <p className="text-sm text-good">
                  <Link href={`/members/${lead.convertedMember.id}`} className="font-semibold hover:underline">
                    {lead.convertedMember.firstName} {lead.convertedMember.lastName}
                  </Link>{" "}
                  — estado {lead.convertedMember.state}
                </p>
              </div>
            ) : (
              <Card title="Alta en curso / cliente">
                <p className="text-sm text-brand-text-2">
                  <Link href={`/members/${lead.convertedMember.id}`} className="text-brand-text font-semibold hover:underline">
                    {lead.convertedMember.firstName} {lead.convertedMember.lastName}
                  </Link>{" "}
                  — estado {lead.convertedMember.state}
                </p>
              </Card>
            )
          ) : (
            !archived && (
              <Card title="Cerrar venta">
                <ConvertLeadForm leadId={lead.id} plans={plans} />
              </Card>
            )
          )}

          {!archived && lead.status !== "CERRADO" && (
            <Card title="Archivar como no cerrado">
              <NoCloseForm leadId={lead.id} reasons={reasons} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

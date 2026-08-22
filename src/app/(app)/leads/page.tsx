import { requireRole } from "@/lib/guard";
import { canManageLeads, canManageOrg } from "@/lib/rbac";
import {
  listLeads,
  listLeadChannels,
  listNoCloseReasons,
  listCentersForLead,
  getLeadCloseRate,
  getLeadCloseTypeBreakdown,
  countLeadsWithoutOwner,
  getLeadChannelDistribution,
  getLeadNoCloseReasonDistribution,
} from "@/lib/leads-queries";
import { listActivePlansForOrg } from "@/lib/members-queries";
import { KpiCard } from "@/components/kpi-card";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { LeadCloseType, LeadStatus } from "@prisma/client";
import { NewLeadDrawer } from "./new-lead-drawer";
import { LeadsBoard } from "./leads-board";
import { LeadConfigPanel } from "./lead-config-panel";

const COLUMNS: { status: LeadStatus; label: string; tone: "neutral" | "trial" | "warning" | "good" | "critical"; dot: string }[] = [
  { status: "SIN_CONTACTAR", label: "Sin contactar", tone: "neutral", dot: "#8a8574" },
  { status: "SEGUIMIENTO", label: "Seguimiento", tone: "trial", dot: "#5c4a34" },
  { status: "CON_FECHA_VALORACION", label: "Con fecha de valoración", tone: "warning", dot: "#8a5a12" },
  { status: "CERRADO", label: "Cerrado", tone: "good", dot: "#4b5a22" },
  { status: "NO_CERRADO", label: "No cerrado", tone: "critical", dot: "#8a3420" },
];

const CLOSE_TYPE_OPTIONS: { value: string; label: string; tone?: "trial" | "gold" }[] = [
  { value: "", label: "Todos" },
  { value: "EMBUDO", label: "Embudo" },
  { value: "DIRECTO", label: "Directo", tone: "trial" },
  { value: "ONLINE", label: "Online", tone: "gold" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; centerId?: string; closeType?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const params = await searchParams;
  const canCreate = canManageLeads(session.user.role);
  const closeTypeFilter = (params.closeType || "") as LeadCloseType | "";

  const [leads, channels, , centers, closeRate, closeBreakdown, withoutOwner, channelDist, reasonDist, plans] = await Promise.all([
    listLeads(session.user.orgId, { q: params.q, centerId: params.centerId }),
    listLeadChannels(session.user.orgId),
    listNoCloseReasons(session.user.orgId),
    listCentersForLead(session.user.orgId),
    getLeadCloseRate(session.user.orgId),
    getLeadCloseTypeBreakdown(session.user.orgId),
    countLeadsWithoutOwner(session.user.orgId),
    getLeadChannelDistribution(session.user.orgId),
    getLeadNoCloseReasonDistribution(session.user.orgId),
    listActivePlansForOrg(session.user.orgId),
  ]);

  const byStatus: Record<string, typeof leads> = {};
  for (const col of COLUMNS) byStatus[col.status] = [];
  for (const lead of leads) {
    if (lead.status === "CERRADO" && closeTypeFilter && lead.closeType !== closeTypeFilter) continue;
    byStatus[lead.status]?.push(lead);
  }

  const { funnel } = closeRate;
  const decided = funnel.cerrado + funnel.noCerrado;

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Embudo comercial"
        description={`${leads.length} leads en el embudo comercial · arrastra las tarjetas entre columnas`}
        actions={canCreate ? <NewLeadDrawer centers={centers} channels={channels} plans={plans} /> : undefined}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <KpiCard label="Leads totales" value={String(leads.length)} hint="en el embudo" tone="accent" />
        <KpiCard
          label="Tasa de cierre"
          value={closeRate.closeRatePct === null ? "—" : `${closeRate.closeRatePct}%`}
          hint={`${funnel.cerrado} de ${decided} decididos`}
          tone="good"
        />
        <KpiCard
          label="Cerrados"
          value={String(funnel.cerrado)}
          hint={`${closeBreakdown.embudo} embudo · ${closeBreakdown.directo} directo · ${closeBreakdown.online} online`}
          tone="gold"
        />
        <KpiCard label="Con cita valoración" value={String(funnel.conFechaValoracion)} hint="agendadas" tone="warning" />
        <KpiCard
          label="Sin responsable"
          value={String(withoutOwner)}
          hint="requieren asignación"
          tone={withoutOwner > 0 ? "critical" : "default"}
        />
      </div>

      <FilterBar
        kicker="Filtrar leads"
        searchName="q"
        searchDefault={params.q}
        searchPlaceholder="Buscar por nombre o teléfono..."
        chipName="centerId"
        chipLabel="Centro"
        chipDefault={params.centerId}
        chipOptions={[{ value: "", label: "Todos" }, ...centers.map((c) => ({ value: c.id, label: c.name }))]}
        extraChipName="closeType"
        extraChipLabel="Tipo de cierre (solo columna Cerrado)"
        extraChipDefault={params.closeType}
        extraChipOptions={CLOSE_TYPE_OPTIONS}
      />

      {leads.length === 0 ? (
        <EmptyState title="Sin leads" description="Todavía no hay contactos en el embudo comercial." />
      ) : (
        <LeadsBoard columns={COLUMNS} leadsByStatus={byStatus} canClaim={canCreate} />
      )}

      {canManageOrg(session.user.role) && <LeadConfigPanel channelDistribution={channelDist} reasonDistribution={reasonDist} />}
    </div>
  );
}

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
import { centerScopeFor } from "@/lib/center-scope";
import { KpiCard } from "@/components/kpi-card";
import { FilterToolbar, type FilterGroup } from "@/components/ui/filter-toolbar";
import { parseFilterValues } from "@/lib/filter-params";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { LeadStatus } from "@prisma/client";
import { NewLeadDrawer } from "./new-lead-drawer";
import { LeadsBoard } from "./leads-board";
import { LeadConfigPanel } from "./lead-config-panel";

const COLUMNS: { status: LeadStatus; label: string; tone: "neutral" | "trial" | "warning" | "good" | "critical"; dot: string }[] = [
  { status: "SIN_CONTACTAR", label: "Sin contactar", tone: "neutral", dot: "var(--color-brand-muted)" },
  { status: "SEGUIMIENTO", label: "Seguimiento", tone: "trial", dot: "var(--color-trial)" },
  { status: "CON_FECHA_VALORACION", label: "Con fecha de valoración", tone: "warning", dot: "var(--color-warning)" },
  { status: "CERRADO", label: "Cerrado", tone: "good", dot: "var(--color-good)" },
  { status: "NO_CERRADO", label: "No cerrado", tone: "critical", dot: "var(--color-critical)" },
];

const CLOSE_TYPE_OPTIONS: { value: string; label: string; tone?: "trial" | "gold" }[] = [
  { value: "EMBUDO", label: "Embudo" },
  { value: "DIRECTO", label: "Directo", tone: "trial" },
  { value: "ONLINE", label: "Online", tone: "gold" },
];

/** Valor del eje «Responsable» para los leads sin asignar (RB-LEAD-003). */
const NO_OWNER = "none";

type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

type LeadSelection = { centerId: string[]; closeType: string[]; channel: string[]; ownerId: string[] };

/**
 * Un lead pasa el filtro cuando encaja en TODOS los ejes con valores (AND entre
 * ejes, OR dentro de cada uno). El tipo de cierre solo se aplica a los leads
 * cerrados: es un dato que el resto no tiene, y filtrar por él no debe vaciar
 * las demás columnas del tablero.
 */
function matchesLead(lead: LeadRow, sel: LeadSelection): boolean {
  if (sel.centerId.length && !sel.centerId.includes(lead.centerId)) return false;
  if (sel.channel.length && !sel.channel.includes(lead.channel)) return false;
  if (sel.ownerId.length && !sel.ownerId.includes(lead.ownerUserId ?? NO_OWNER)) return false;
  if (sel.closeType.length && lead.status === "CERRADO" && !sel.closeType.includes(lead.closeType ?? "")) return false;
  return true;
}

function leadFacetCount(base: LeadRow[], sel: LeadSelection, axis: keyof LeadSelection, value: string) {
  return base.filter((lead) => matchesLead(lead, { ...sel, [axis]: [value] })).length;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; centerId?: string; closeType?: string; channel?: string; ownerId?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const params = await searchParams;
  const canCreate = canManageLeads(session.user.role);

  const selection: LeadSelection = {
    centerId: parseFilterValues(params.centerId),
    closeType: parseFilterValues(params.closeType),
    channel: parseFilterValues(params.channel),
    ownerId: parseFilterValues(params.ownerId),
  };

  // Ámbito de centro (center-scope.ts), igual que en /members y /billing:
  // dirección de organización ve toda la empresa; el resto del equipo, solo
  // los leads de los centros a los que está imputado. La API móvil ya lo
  // aplicaba; la web filtraba únicamente por organización.
  const scope = await centerScopeFor(session.user);
  const centerIds = scope ?? undefined;

  // Solo la búsqueda va a la query: los ejes se resuelven sobre el mismo
  // conjunto que alimenta los recuentos por opción, así que un filtro nunca
  // deja el tablero vacío sin avisar de cuántos leads dejaría cada valor.
  const [allLeads, channels, , centers, closeRate, closeBreakdown, withoutOwner, channelDist, reasonDist, plans] = await Promise.all([
    listLeads(session.user.orgId, { q: params.q, centerIds }),
    listLeadChannels(session.user.orgId),
    listNoCloseReasons(session.user.orgId),
    listCentersForLead(session.user.orgId, centerIds),
    getLeadCloseRate(session.user.orgId, { centerIds }),
    getLeadCloseTypeBreakdown(session.user.orgId, centerIds),
    countLeadsWithoutOwner(session.user.orgId, centerIds),
    getLeadChannelDistribution(session.user.orgId, centerIds),
    getLeadNoCloseReasonDistribution(session.user.orgId, centerIds),
    listActivePlansForOrg(session.user.orgId),
  ]);

  const leads = allLeads.filter((lead) => matchesLead(lead, selection));

  const byStatus: Record<string, typeof leads> = {};
  for (const col of COLUMNS) byStatus[col.status] = [];
  for (const lead of leads) byStatus[lead.status]?.push(lead);

  // Responsables presentes en el embudo: no hace falta la lista completa de
  // usuarios, y así el eje no ofrece a quien no tiene ningún lead.
  const owners = new Map<string, string>();
  for (const lead of allLeads) {
    if (lead.ownerUserId) owners.set(lead.ownerUserId, lead.owner?.name ?? "Sin nombre");
  }

  const filterGroups: FilterGroup[] = [
    {
      name: "centerId",
      label: "Centro",
      width: 268,
      options: centers.map((c) => ({
        value: c.id,
        label: c.name,
        count: leadFacetCount(allLeads, selection, "centerId", c.id),
      })),
    },
    {
      name: "closeType",
      label: "Tipo de cierre",
      width: 262,
      options: CLOSE_TYPE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        tone: o.tone,
        count: leadFacetCount(allLeads, selection, "closeType", o.value),
      })),
    },
    {
      name: "channel",
      label: "Canal",
      width: 252,
      options: channels.map((c) => ({
        value: c.label,
        label: c.label,
        count: leadFacetCount(allLeads, selection, "channel", c.label),
      })),
    },
    {
      name: "ownerId",
      label: "Responsable",
      width: 252,
      options: [
        ...[...owners].map(([id, name]) => ({
          value: id,
          label: name,
          count: leadFacetCount(allLeads, selection, "ownerId", id),
        })),
        {
          value: NO_OWNER,
          label: "Sin responsable",
          count: leadFacetCount(allLeads, selection, "ownerId", NO_OWNER),
        },
      ],
    },
  ];

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

      <FilterToolbar
        groups={filterGroups}
        total={leads.length}
        resultLabel={{ one: "lead", many: "leads" }}
        searchPlaceholder="Buscar nombre o teléfono…"
      />

      {leads.length === 0 ? (
        // Con filtros puestos, «todavía no hay contactos» sería mentira: lo que
        // no hay son leads que encajen.
        allLeads.length === 0 ? (
          <EmptyState title="Sin leads" description="Todavía no hay contactos en el embudo comercial." />
        ) : (
          <EmptyState title="Sin resultados" description="Ningún lead coincide con estos filtros." />
        )
      ) : (
        <LeadsBoard columns={COLUMNS} leadsByStatus={byStatus} canClaim={canCreate} />
      )}

      {canManageOrg(session.user.role) && <LeadConfigPanel channelDistribution={channelDist} reasonDistribution={reasonDist} />}
    </div>
  );
}

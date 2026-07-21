import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { canManageLeads, canManageOrg } from "@/lib/rbac";
import { listLeads, listLeadChannels, listNoCloseReasons, listCentersForLead } from "@/lib/leads-queries";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { LeadStatus } from "@prisma/client";
import { NewLeadDrawer } from "./new-lead-drawer";
import { ClaimLeadButton } from "./lead-actions-inline";
import { LeadConfigPanel } from "./lead-config-panel";

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "SIN_CONTACTAR", label: "Sin contactar" },
  { status: "SEGUIMIENTO", label: "Seguimiento" },
  { status: "CON_FECHA_VALORACION", label: "Con fecha de valoración" },
  { status: "CERRADO", label: "Cerrado" },
  { status: "NO_CERRADO", label: "No cerrado" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; centerId?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const params = await searchParams;
  const canCreate = canManageLeads(session.user.role);

  const [leads, channels, reasons, centers] = await Promise.all([
    listLeads(session.user.orgId, { q: params.q, centerId: params.centerId }),
    listLeadChannels(session.user.orgId),
    listNoCloseReasons(session.user.orgId),
    listCentersForLead(session.user.orgId),
  ]);

  const byStatus = new Map<LeadStatus, typeof leads>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const lead of leads) byStatus.get(lead.status)?.push(lead);

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        description={`${leads.length} leads en el embudo comercial`}
        actions={canCreate ? <NewLeadDrawer centers={centers} channels={channels} /> : undefined}
      />

      <FilterBar
        kicker="Filtrar leads"
        searchName="q"
        searchDefault={params.q}
        searchPlaceholder="Buscar por nombre o teléfono..."
        chipName="centerId"
        chipLabel="Centro"
        chipDefault={params.centerId}
        chipOptions={[{ value: "", label: "Todos" }, ...centers.map((c) => ({ value: c.id, label: c.name }))]}
      />

      {leads.length === 0 ? (
        <EmptyState title="Sin leads" description="Todavía no hay contactos en el embudo comercial." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
          {COLUMNS.map((col) => {
            const items = byStatus.get(col.status) ?? [];
            return (
              <div key={col.status} className="bg-brand-card border border-brand-border rounded-card shadow-card overflow-hidden">
                <div className="px-3.5 py-3 border-b border-brand-border flex items-center justify-between">
                  <span className="font-display font-bold text-[11px] uppercase tracking-[.1em] text-brand-muted">{col.label}</span>
                  <Badge tone="neutral" dot={false}>
                    {items.length}
                  </Badge>
                </div>
                <div className="p-2.5 space-y-2 max-h-[70vh] overflow-y-auto">
                  {items.map((lead) => (
                    <div key={lead.id} className="rounded-control border border-brand-border bg-white p-3 hover:shadow-hover transition-shadow duration-200">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-sm text-brand-text hover:underline">
                        {lead.firstName} {lead.lastName}
                      </Link>
                      <p className="text-xs text-brand-muted mt-0.5">{lead.center.name}</p>
                      <p className="text-xs text-faint mt-0.5">{lead.channel} · {lead.phone}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-brand-text-2">{lead.owner?.name ?? "Sin responsable"}</span>
                        {!lead.owner && canCreate && <ClaimLeadButton leadId={lead.id} />}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-xs text-faint text-center py-4">Vacío</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canManageOrg(session.user.role) && <LeadConfigPanel channels={channels} reasons={reasons} />}
    </div>
  );
}

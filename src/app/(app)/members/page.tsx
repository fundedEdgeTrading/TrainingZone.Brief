import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { listMembers, listCentersForOrg, listActivePlansForOrg } from "@/lib/members-queries";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE } from "@/lib/chart-colors";
import { canManageMembers, canImportMembers } from "@/lib/rbac";
import type { MemberState } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { NewMemberDrawer } from "./new-member-drawer";
import { ImportMembersDrawer } from "./import-members-drawer";

const STATES: MemberState[] = ["ACTIVE", "DELINQUENT", "FROZEN", "TRIAL", "PROSPECT", "CANCELLED"];

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const params = await searchParams;
  const canCreate = canManageMembers(session.user.role);
  const canImport = canImportMembers(session.user.role);
  const [members, centers, plans] = await Promise.all([
    listMembers(session.user.orgId, {
      q: params.q,
      state: (params.state as MemberState) || undefined,
    }),
    canCreate ? listCentersForOrg(session.user.orgId) : Promise.resolve([]),
    canCreate ? listActivePlansForOrg(session.user.orgId) : Promise.resolve([]),
  ]);

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        description={`${members.length} resultados`}
        actions={
          canCreate ? (
            <div className="flex items-center gap-2">
              {canImport && <ImportMembersDrawer centers={centers} />}
              <NewMemberDrawer centers={centers} plans={plans} />
            </div>
          ) : undefined
        }
      />

      <FilterBar
        kicker="Filtrar socios"
        searchName="q"
        searchDefault={params.q}
        searchPlaceholder="Buscar por nombre o email..."
        chipName="state"
        chipLabel="Estado"
        chipDefault={params.state}
        chipOptions={[
          { value: "", label: "Todos" },
          ...STATES.map((s) => ({ value: s, label: MEMBER_STATE_LABEL[s], tone: MEMBER_STATE_TONE[s] })),
        ]}
      />

      <DataTable
        columns={memberColumns}
        rows={members.map(memberToRow)}
        emptyTitle="Sin resultados"
        emptyDescription="No hay socios que coincidan con estos filtros."
      />
    </div>
  );
}

type Member = Awaited<ReturnType<typeof listMembers>>[number];

const memberColumns: DataTableColumn[] = [
  { key: "name", header: "Socio", sortable: true },
  { key: "center", header: "Centro", sortable: true, className: "text-brand-text-2" },
  { key: "state", header: "Estado", sortable: true },
  { key: "plan", header: "Plan actual", sortable: true, className: "text-brand-text-2" },
  { key: "joinedAt", header: "Alta", sortable: true, className: "text-brand-muted tz-nums" },
];

function memberToRow(m: Member, i: number): DataTableRow {
  return {
    key: m.id,
    className: "group",
    style: i < 6 ? { animation: `tzFadeUp .4s ${(i * 0.03).toFixed(2)}s both` } : undefined,
    sortValues: {
      name: `${m.lastName} ${m.firstName}`,
      center: m.primaryCenter.name,
      state: MEMBER_STATE_LABEL[m.state],
      plan: m.subscriptions[0]?.plan.name ?? "",
      joinedAt: m.joinedAt.getTime(),
    },
    cells: {
      name: (
        <Link href={`/members/${m.id}`} className="flex items-center gap-3">
          {m.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario (data URL)
            <img src={m.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-9 h-9 rounded-full bg-tz-sand text-brand-text-2 font-display font-bold text-xs flex items-center justify-center shrink-0">
              {initials(m.firstName, m.lastName)}
            </span>
          )}
          <span>
            <span className="font-semibold text-brand-text group-hover:underline">
              {m.firstName} {m.lastName}
            </span>
            <span className="block text-xs text-faint">{m.email}</span>
          </span>
        </Link>
      ),
      center: m.primaryCenter.name,
      state: <Badge tone={MEMBER_STATE_TONE[m.state]}>{MEMBER_STATE_LABEL[m.state]}</Badge>,
      plan: m.subscriptions[0]?.plan.name ?? "—",
      joinedAt: m.joinedAt.toLocaleDateString("es-ES"),
    },
  };
}

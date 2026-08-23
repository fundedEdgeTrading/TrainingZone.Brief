import Link from "next/link";
import { requireRole } from "@/lib/guard";
import {
  listMembers,
  listMemberFilterBase,
  lastAttendanceByMember,
  listCentersForOrg,
  listActivePlansForOrg,
} from "@/lib/members-queries";
import { bonoUsage } from "@/lib/session-balance";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE } from "@/lib/chart-colors";
import { canManageMembers, canImportMembers } from "@/lib/rbac";
import { parseFilterValues } from "@/lib/filter-params";
import { centerScopeFor, intersectCenterScope } from "@/lib/center-scope";
import type { MemberState } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { ColumnFilter } from "@/components/ui/column-filter";
import { FilterRail } from "@/components/ui/filter-rail";
import type { FilterGroup } from "@/components/ui/filter-toolbar";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { NewMemberDrawer } from "./new-member-drawer";
import { ImportMembersDrawer } from "./import-members-drawer";
import {
  JOINED_OPTIONS,
  MEMBER_AXIS,
  PLAN_KIND_LABEL,
  PLAN_KIND_ORDER,
  matchesMemberFilters,
  memberFacetCounts,
  planKindOf,
  type MemberSelection,
} from "./members-filters";

const STATES: MemberState[] = ["ACTIVE", "DELINQUENT", "FROZEN", "TRIAL", "PROSPECT", "CANCELLED"];

/** A partir de aquí una visita deja de ser rutina y pasa a ser señal de riesgo. */
const STALE_VISIT_DAYS = 14;

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; centerId?: string; plan?: string; joined?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const params = await searchParams;
  const canCreate = canManageMembers(session.user.role);
  const canImport = canImportMembers(session.user.role);

  const selection: MemberSelection = {
    state: parseFilterValues(params.state),
    centerId: parseFilterValues(params.centerId),
    plan: parseFilterValues(params.plan),
    joined: parseFilterValues(params.joined),
  };

  // Ámbito de centro (center-scope.ts): dirección de organización ve toda la
  // empresa; el resto del equipo, solo los socios de los centros a los que está
  // imputado. Antes el listado era siempre de toda la organización y la ficha
  // se abría por URL sin más, así que una dirección de centro llegaba al
  // expediente completo —salud incluida— de un socio de otro centro.
  const scope = await centerScopeFor(session.user);
  const scopedCenterIds = intersectCenterScope(scope, selection.centerId);

  // Estado y Centro se filtran en la query; Plan y Alta, en memoria (ver
  // `members-filters.ts`). `filterBase` solo aplica la búsqueda: es la base con
  // la que se calculan los recuentos por opción de cada eje.
  const [rawMembers, filterBase, centers, plans] = await Promise.all([
    listMembers(session.user.orgId, {
      q: params.q,
      states: selection.state as MemberState[],
      centerIds: scopedCenterIds,
    }),
    listMemberFilterBase(session.user.orgId, { q: params.q, centerIds: scope ?? undefined }),
    listCentersForOrg(session.user.orgId, scope),
    canCreate ? listActivePlansForOrg(session.user.orgId) : Promise.resolve([]),
  ]);

  const now = new Date();
  const members = rawMembers.filter((m) =>
    matchesMemberFilters(
      {
        state: m.state,
        primaryCenterId: m.primaryCenterId,
        joinedAt: m.joinedAt,
        planKind: planKindOf(m.subscriptions[0]?.plan.type),
      },
      selection,
      now,
    ),
  );

  const facets = memberFacetCounts(
    filterBase.map((m) => ({
      state: m.state,
      primaryCenterId: m.primaryCenterId,
      joinedAt: m.joinedAt,
      planKind: planKindOf(m.subscriptions[0]?.plan.type),
    })),
    selection,
    now,
  );

  const lastVisits = await lastAttendanceByMember(members.map((m) => m.id));

  const groups: FilterGroup[] = [
    {
      name: MEMBER_AXIS.center,
      label: "Centro",
      width: 268,
      options: centers.map((c) => ({ value: c.id, label: c.name, count: facets.centerId[c.id] ?? 0 })),
    },
    {
      name: MEMBER_AXIS.state,
      label: "Estado",
      width: 252,
      options: STATES.map((s) => ({
        value: s,
        label: MEMBER_STATE_LABEL[s],
        tone: MEMBER_STATE_TONE[s],
        count: facets.state[s] ?? 0,
      })),
    },
    {
      name: MEMBER_AXIS.plan,
      label: "Plan",
      width: 262,
      options: PLAN_KIND_ORDER.map((k) => ({ value: k, label: PLAN_KIND_LABEL[k], count: facets.plan[k] ?? 0 })),
    },
    {
      name: MEMBER_AXIS.joined,
      label: "Alta",
      width: 244,
      options: JOINED_OPTIONS.map((o) => ({ ...o, count: facets.joined[o.value] ?? 0 })),
    },
  ];

  const byName = new Map(groups.map((g) => [g.name, g]));
  const columns = memberColumns(byName, selection);

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        description="Filtra desde la cabecera de cada columna: los cambios se aplican al instante."
        actions={
          canCreate ? (
            <div className="flex items-center gap-2">
              {canImport && <ImportMembersDrawer centers={centers} />}
              <NewMemberDrawer centers={centers} plans={plans} />
            </div>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={members.map((m, i) => memberToRow(m, i, lastVisits.get(m.id) ?? null, now))}
        density="compact"
        pageSize={12}
        // Las 12 filas compactas caben de sobra: recortar el cuerpo a 560 px
        // metía un scroll dentro de la tarjeta y dejaba la última fila cortada.
        maxBodyHeight="none"
        toolbar={
          <FilterRail
            groups={groups}
            total={members.length}
            resultLabel={{ one: "socio", many: "socios" }}
            searchPlaceholder="Buscar nombre o email…"
          />
        }
        emptyTitle="Sin resultados"
        emptyDescription="No hay socios que coincidan con estos filtros."
      />
    </div>
  );
}

type Member = Awaited<ReturnType<typeof listMembers>>[number];

/**
 * Variante «filtros en columna» del handoff: cada eje con columna visible
 * cuelga de la cabecera de su columna, así que la tabla no necesita barra de
 * filtros encima y el listado empieza en pantalla. Los ejes que no tienen
 * columna —y todos, en móvil, donde la tabla se convierte en tarjetas— viven en
 * el riel de la tarjeta (`FilterRail`).
 */
function memberColumns(groups: Map<string, FilterGroup>, selection: MemberSelection): DataTableColumn[] {
  const filterFor = (axis: keyof MemberSelection) => {
    const group = groups.get(MEMBER_AXIS[axis === "centerId" ? "center" : axis]);
    if (!group) return {};
    return {
      filter: <ColumnFilter axis={group.name} label={group.label} options={group.options} width={group.width} />,
      filterActive: selection[axis].length > 0,
    };
  };

  // Anchos acotados: con nombres de centro y de plan largos, la tabla se
  // ensanchaba hasta desbordar y las columnas de la derecha quedaban fuera de
  // pantalla. Centro y Plan se recortan con puntos suspensivos (el ancho manda
  // el `max-w` de su celda, no un `width` de columna, para que la columna Socio
  // absorba el sobrante), y las dos columnas nuevas aparecen a partir de `xl` /
  // `2xl`: en un portátil estrecho el dato principal sigue siendo el socio, y
  // siete columnas no caben sin arrastrar la tabla en horizontal.
  return [
    { key: "name", header: "Socio", sortable: true },
    {
      key: "center",
      header: "Centro",
      sortable: true,
      className: "text-brand-text-2",
      ...filterFor("centerId"),
    },
    { key: "state", header: "Estado", sortable: true, thClassName: "w-[134px]", ...filterFor("state") },
    {
      key: "plan",
      header: "Plan actual",
      sortable: true,
      className: "text-brand-text-2",
      ...filterFor("plan"),
    },
    { key: "bonus", header: "Bono usado", sortable: true, thClassName: "w-[118px] hidden xl:table-cell", className: "hidden xl:table-cell", cardClassName: "" },
    {
      key: "lastVisit",
      header: "Última visita",
      sortable: true,
      thClassName: "w-[128px] hidden 2xl:table-cell",
      className: "hidden 2xl:table-cell",
      cardClassName: "",
    },
    {
      key: "joinedAt",
      header: "Alta",
      sortable: true,
      className: "text-brand-muted tz-nums whitespace-nowrap",
      thClassName: "w-[104px]",
      ...filterFor("joined"),
    },
  ];
}

/** «hoy» / «ayer» / «hace N días»: la señal de riesgo que hoy hay que ir a buscar a Retención. */
function visitLabel(days: number) {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

function memberToRow(m: Member, i: number, lastVisit: Date | null, now: Date): DataTableRow {
  const sub = m.subscriptions[0] ?? null;
  const planKind = planKindOf(sub?.plan.type);
  const remaining = sub?.sessionsRemaining ?? null;
  // `sessionsRemaining` null = bono ilimitado (cuota mensual / online).
  const unlimited = sub != null && remaining == null;
  const low = remaining != null && remaining <= 2;
  // La columna enseña lo CONSUMIDO sobre el bono («6 / 12» = seis sesiones
  // gastadas de doce). Las tres cifras salen de `bonoUsage`, que las cuadra
  // (gastadas + disponibles = total) aunque a recepción le haya dado saldo de
  // más — mismo criterio que `getSessionBalances`, para que la ficha del socio
  // y su portal no cuenten distinto.
  const usage = sub ? bonoUsage(sub.plan.sessionsIncluded, remaining) : null;
  const used = usage?.used ?? null;
  const pct = usage && usage.total > 0 ? Math.round((usage.used / usage.total) * 100) : 100;

  const visitDays = lastVisit ? Math.floor((now.getTime() - lastVisit.getTime()) / 86_400_000) : null;
  const stale = visitDays != null && visitDays > STALE_VISIT_DAYS;

  return {
    key: m.id,
    className: "group",
    // tzRowIn (7 px) en vez de tzFadeUp (16 px): en una tabla densa un salto de
    // 16 px se lee como un brinco, no como una entrada.
    style: i < 8 ? { animation: `tzRowIn .4s ${(i * 0.045).toFixed(3)}s both` } : undefined,
    sortValues: {
      name: `${m.lastName} ${m.firstName}`,
      center: m.primaryCenter.name,
      state: MEMBER_STATE_LABEL[m.state],
      plan: sub?.plan.name ?? "",
      // Ordena por lo que enseña la celda (sesiones consumidas); los bonos
      // ilimitados y los socios sin bono no tienen consumo con el que comparar
      // y caen al final.
      bonus: used ?? null,
      lastVisit: visitDays ?? 9999,
      joinedAt: m.joinedAt.getTime(),
    },
    cells: {
      name: (
        <Link href={`/members/${m.id}`} className="flex items-center gap-3">
          {m.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por el usuario (data URL)
            <img
              src={m.photoUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0"
              style={{ viewTransitionName: `member-avatar-${m.id}` }}
            />
          ) : (
            <span
              className="w-8 h-8 rounded-full bg-tz-sand text-brand-text-2 font-display font-bold text-[11.5px] flex items-center justify-center shrink-0"
              style={{ viewTransitionName: `member-avatar-${m.id}` }}
            >
              {initials(m.firstName, m.lastName)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[13.5px] text-brand-text group-hover:underline">
              {m.firstName} {m.lastName}
            </span>
            <span className="block truncate text-[11.5px] text-faint">{m.email}</span>
          </span>
        </Link>
      ),
      center: <span className="block max-w-[170px] truncate">{m.primaryCenter.name}</span>,
      state: <Badge tone={MEMBER_STATE_TONE[m.state]}>{MEMBER_STATE_LABEL[m.state]}</Badge>,
      plan: <span className="block max-w-[190px] truncate">{sub?.plan.name ?? "—"}</span>,
      bonus:
        planKind === "NONE" ? (
          <span className="text-faint">—</span>
        ) : (
          <span
            className="flex flex-col gap-[5px]"
            title={
              unlimited
                ? "Bono ilimitado"
                : usage
                  ? `${usage.used} de ${usage.total} sesiones consumidas · quedan ${usage.remaining}`
                  : undefined
            }
          >
            <span
              className={`text-[12.5px] font-semibold tz-nums ${low ? "text-critical" : unlimited ? "text-faint" : "text-brand-text"}`}
            >
              {unlimited ? "Ilimitado" : usage ? `${usage.used} / ${usage.total}` : "—"}
            </span>
            <span className="block h-1 w-16 overflow-hidden rounded-pill bg-tz-sand">
              <span
                className={`block h-full rounded-pill ${low ? "bg-critical" : unlimited ? "bg-brand-border" : "bg-tz-black"}`}
                style={{ width: `${pct}%`, transformOrigin: "left", animation: "tzGrow .5s var(--ease-out-soft) both" }}
              />
            </span>
          </span>
        ),
      lastVisit:
        visitDays == null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className={stale ? "font-semibold text-critical" : "text-brand-text-2"}>{visitLabel(visitDays)}</span>
        ),
      joinedAt: m.joinedAt.toLocaleDateString("es-ES"),
    },
  };
}

import Link from "next/link";
import { requireRole } from "@/lib/guard";
import {
  listMembers,
  listMemberFilterBase,
  lastAttendanceByMember,
  listCentersForOrg,
  listActivePlansForOrg,
  weeklyFrequencyByMember,
  FREQUENCY_WINDOW_WEEKS,
  type MemberRhythm,
} from "@/lib/members-queries";
import { getPackSummaryByCenter } from "@/lib/bonos-queries";
import { parseRange } from "@/lib/dashboard-range";
import { MEMBER_STATE_LABEL, MEMBER_STATE_TONE } from "@/lib/chart-colors";
import { canManageMembers, canImportMembers } from "@/lib/rbac";
import { parseFilterValues } from "@/lib/filter-params";
import { centerScopeFor, intersectCenterScope } from "@/lib/center-scope";
import { openRetentionAlertsByMember, type RetentionSignal } from "@/lib/retention";
import type { MemberState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { ColumnFilter } from "@/components/ui/column-filter";
import { FilterRail } from "@/components/ui/filter-rail";
import type { FilterGroup } from "@/components/ui/filter-toolbar";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { BonosPorCentroCard } from "./bonos-card";
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

/** E12-10: tamaño de página del listado, paginado en servidor. */
const MEMBERS_PAGE_SIZE = 25;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    state?: string;
    centerId?: string;
    plan?: string;
    joined?: string;
    page?: string;
    /** E14-08 · Periodo de las cifras de FLUJO de la card de bonos, como en el resto del panel. */
    range?: string;
  }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const params = await searchParams;
  const range = parseRange(params.range);
  const canCreate = canManageMembers(session.user.role);
  const canImport = canImportMembers(session.user.role);
  // E6-06: exportar es cosa de dirección, igual que en /api/export/members.
  const canExport = session.user.role === "OWNER" || session.user.role === "CENTER_DIRECTOR";

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
  const [rawMembers, filterBase, centers, plans, orgAgePolicy] = await Promise.all([
    listMembers(session.user.orgId, {
      q: params.q,
      states: selection.state as MemberState[],
      centerIds: scopedCenterIds,
    }),
    listMemberFilterBase(session.user.orgId, { q: params.q, centerIds: scope ?? undefined }),
    listCentersForOrg(session.user.orgId, scope),
    canCreate ? listActivePlansForOrg(session.user.orgId) : Promise.resolve([]),
    // E10-12: el alta necesita saber si el centro admite menores para pedir (o
    // no) los datos del tutor. El control de verdad está en el servidor.
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { allowsMinors: true, minimumAgeYears: true },
    }),
  ]);
  const agePolicy = orgAgePolicy ?? { allowsMinors: false, minimumAgeYears: 18 };

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

  // E12-10: `members` ya es el conjunto COMPLETO del ámbito con los filtros
  // aplicados (listMembers ya no trunca en 300). El total real es su longitud,
  // ANTES de recortar a la página que se pinta — recortar antes falsearía el
  // recuento que enseña FilterRail.
  const total = members.length;
  const pageCount = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
  const pageMembers = members.slice((page - 1) * MEMBERS_PAGE_SIZE, page * MEMBERS_PAGE_SIZE);

  const memberIds = pageMembers.map((m) => m.id);
  // La caída de frecuencia (G.3) se lee aquí, en la columna que dirección ya
  // mira, en vez de en una pantalla aparte: «hace N días» dice cuándo vino por
  // última vez, y la alerta, si ese silencio rompe SU hábito o es su ritmo
  // normal. Ambas consultas van juntas porque alimentan la misma celda.
  // E14-09 · El ritmo va en la misma tanda y con el mismo patrón (E12-10): una
  // agregación sobre la PÁGINA, no una consulta por fila. Son tres consultas
  // para veinticinco socios, no setenta y cinco.
  const [lastVisits, retentionAlerts, rhythms] = await Promise.all([
    lastAttendanceByMember(memberIds),
    openRetentionAlertsByMember(memberIds),
    weeklyFrequencyByMember(
      pageMembers.map((m) => ({ id: m.id, joinedAt: m.joinedAt })),
      now,
    ),
  ]);

  // E14-08 · Las cifras agregadas son lectura de dirección, igual que la
  // exportación: recepción y entrenadores trabajan la ficha del socio que
  // tienen delante, no el stock de sesiones del centro.
  const bonos = canExport
    ? await getPackSummaryByCenter(
        session.user.orgId,
        // Mismo ámbito y mismo filtro de centro que el listado de abajo: una
        // card que contara la organización entera sobre una lista filtrada por
        // un centro sería la discrepancia de siempre bajo el mismo rótulo.
        { centerIds: scopedCenterIds, range },
        now,
      )
    : null;

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
          canCreate || canExport ? (
            <div className="flex items-center gap-2">
              {canExport && (
                <a
                  href="/api/export/members"
                  className="text-xs font-semibold text-brand-text-2 border border-brand-border rounded-lg px-3 py-1.5 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink"
                >
                  Exportar CSV
                </a>
              )}
              {canImport && <ImportMembersDrawer centers={centers} />}
              {canCreate && (
                <NewMemberDrawer
                  centers={centers}
                  plans={plans}
                  agePolicy={{ allowsMinors: agePolicy.allowsMinors, minimumAgeYears: agePolicy.minimumAgeYears }}
                />
              )}
            </div>
          ) : undefined
        }
      />

      {bonos && <BonosPorCentroCard summary={bonos} range={range} params={params} />}

      <DataTable
        columns={columns}
        rows={pageMembers.map((m, i) =>
          memberToRow(
            m,
            i,
            lastVisits.get(m.id) ?? null,
            retentionAlerts.get(m.id) ?? null,
            rhythms.get(m.id) ?? null,
            now,
          ),
        )}
        density="compact"
        // E12-10: la paginación ya la resuelve este componente de servidor
        // (MembersPager, más abajo), con el estado en la URL — DataTable solo
        // pinta la página que le llega.
        pagination={false}
        // Las 12 filas compactas caben de sobra: recortar el cuerpo a 560 px
        // metía un scroll dentro de la tarjeta y dejaba la última fila cortada.
        maxBodyHeight="none"
        toolbar={
          <FilterRail
            groups={groups}
            total={total}
            resultLabel={{ one: "socio", many: "socios" }}
            searchPlaceholder="Buscar nombre o email…"
          />
        }
        emptyTitle="Sin resultados"
        emptyDescription="No hay socios que coincidan con estos filtros."
      />

      <MembersPager page={page} pageCount={pageCount} total={total} params={params} />
    </div>
  );
}

/** Enlaces `?page=N` que conservan el resto de filtros de la URL (E12-10). */
function MembersPager({
  page,
  pageCount,
  total,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  if (total === 0) return null;

  function hrefFor(targetPage: number) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== "page" && value) qs.set(key, value);
    }
    if (targetPage > 1) qs.set("page", String(targetPage));
    const query = qs.toString();
    return query ? `/members?${query}` : "/members";
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-1 text-[12.5px] text-brand-muted">
      <span>Página {page} de {pageCount} · {total} {total === 1 ? "socio" : "socios"} en total</span>
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page === 1}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border border-brand-border text-brand-text-2 hover:bg-tz-bone transition-colors ${
            page === 1 ? "opacity-35 pointer-events-none" : ""
          }`}
          aria-label="Página anterior"
        >
          ‹
        </Link>
        <span className="px-2 font-semibold text-brand-text-2 tz-nums">
          {page} / {pageCount}
        </span>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page === pageCount}
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border border-brand-border text-brand-text-2 hover:bg-tz-bone transition-colors ${
            page === pageCount ? "opacity-35 pointer-events-none" : ""
          }`}
          aria-label="Página siguiente"
        >
          ›
        </Link>
      </div>
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
  // absorba el sobrante).
  //
  // E14-09 · **Quién cede el sitio, y por qué.** «Última visita» estaba en
  // `2xl` (1536 px), o sea invisible en cualquier portátil normal: negocio la
  // pidió creyendo que no existía, y tenía razón práctica aunque no técnica.
  // Sube a `lg` (1024 px) junto a «Ritmo», que es su otra mitad — cuándo vino
  // y cada cuánto viene son una sola lectura y separarlas obliga a cruzarlas de
  // cabeza.
  //
  // El sitio lo cede **«Bono usado», que desaparece del listado**. Medido: con
  // ocho columnas la tabla desborda su tarjeta a CUALQUIER ancho, así que esto
  // no era demotar una y ya, había que quitar una. Y es esta porque su
  // pregunta —«¿a quién se le está acabando el bono?»— la contesta mejor la
  // card de arriba (E14-08): por centro, con la lista de a quién llamar y con
  // la caducidad, en vez de obligar a recorrer 71 barras de progreso a ojo. El
  // detalle de UN bono sigue donde siempre ha estado, en «Plan y pagos» de su
  // ficha.
  //
  // «Plan actual» baja a `2xl`: es el dato más estático de la fila, y su filtro
  // sigue en el riel de la tarjeta, que es donde viven los ejes sin columna
  // visible.
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
      className: "text-brand-text-2 hidden 2xl:table-cell",
      thClassName: "hidden 2xl:table-cell",
      cardClassName: "",
      ...filterFor("plan"),
    },
    {
      key: "lastVisit",
      header: "Última visita",
      sortable: true,
      thClassName: "w-[128px] hidden lg:table-cell",
      className: "hidden lg:table-cell",
      cardClassName: "",
    },
    {
      key: "rhythm",
      // E14-09 · La ventana va EN el encabezado, no en una nota al pie: un
      // «1,3 a la semana» sin ventana declarada no se puede interpretar —
      // significa cosas distintas si es de quince días o de un año—, y quien
      // lee la columna no tiene de dónde sacarla. El `title` la repite entera
      // para quien pase el ratón; el rótulo la lleva abreviada para quien no.
      header: (
        <span title={FREQUENCY_TOOLTIP} className="inline-flex flex-col items-start leading-tight">
          <span>Ritmo</span>
          <span className="text-[9px] font-semibold normal-case tracking-normal text-brand-faint">
            {FREQUENCY_WINDOW_WEEKS} sem
          </span>
        </span>
      ),
      sortable: true,
      thClassName: "w-[104px] hidden lg:table-cell",
      className: "hidden lg:table-cell",
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

/** La ventana declarada, escrita una vez y usada en el encabezado y en la celda. */
const FREQUENCY_TOOLTIP = `Sesiones asistidas por semana en las últimas ${FREQUENCY_WINDOW_WEEKS} semanas (o desde el alta, si el socio entró después). Ordena ascendente para ver primero a quien ha bajado el ritmo.`;

/** «hoy» / «ayer» / «hace N días»: la señal de riesgo que hoy hay que ir a buscar a Retención. */
function visitLabel(days: number) {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

/** «1,3» con coma decimal, que es como se escribe un decimal en castellano. */
function frequencyLabel(perWeek: number): string {
  return perWeek.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function memberToRow(
  m: Member,
  i: number,
  lastVisit: Date | null,
  risk: RetentionSignal | null,
  rhythm: MemberRhythm | null,
  now: Date,
): DataTableRow {
  const sub = m.subscriptions[0] ?? null;

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
      // Ordena por urgencia, no solo por recencia: quien tiene alerta abierta
      // sube por encima de quien lleva los mismos días sin venir pero es su
      // ritmo de siempre. Alta antes que media, y dentro de cada una, la caída
      // mayor primero (`dropPct` es negativo: cuanto menor, peor).
      lastVisit: risk
        ? (risk.riskLevel === "HIGH" ? -2_000_000 : -1_000_000) + risk.dropPct
        : (visitDays ?? 9999),
      // E14-09 · El primer clic de DataTable ordena ASCENDENTE, así que
      // ordenar por esta columna saca arriba a quien menos viene — que es la
      // lectura útil, y por eso no se invierte el valor.
      rhythm: rhythm?.perWeek ?? null,
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
          {/* La columna «Última visita» solo aparece a partir de `2xl`, así que
              el detalle de la caída se pierde en un portátil normal. Aquí, junto
              al nombre, la marca se ve a cualquier ancho: es lo que convierte el
              listado en la lista de a quién llamar. */}
          {risk && (
            <span className="shrink-0" title={`${risk.dropPct}% respecto a su línea base`}>
              <Badge tone="critical">{risk.riskLevel === "HIGH" ? "En fuga" : "En riesgo"}</Badge>
            </span>
          )}
        </Link>
      ),
      center: <span className="block max-w-[150px] truncate">{m.primaryCenter.name}</span>,
      state: <Badge tone={MEMBER_STATE_TONE[m.state]}>{MEMBER_STATE_LABEL[m.state]}</Badge>,
      plan: <span className="block max-w-[170px] truncate">{sub?.plan.name ?? "—"}</span>,
      lastVisit: (
        <span className="flex flex-col gap-[3px]">
          <span
            className={
              risk || stale ? "font-semibold text-critical" : visitDays == null ? "text-faint" : "text-brand-text-2"
            }
          >
            {visitDays == null ? "—" : visitLabel(visitDays)}
          </span>
          {risk && (
            <span
              className="text-[11px] font-semibold tz-nums text-critical"
              title={`Línea base ${risk.baselineFreq.toFixed(1)}/sem → últimas 2 semanas ${risk.recentFreq.toFixed(1)}/sem`}
            >
              {risk.dropPct}% vs. su ritmo
            </span>
          )}
        </span>
      ),
      rhythm: rhythm ? (
        <span
          className="flex flex-col gap-[3px]"
          title={`${rhythm.sessions} ${rhythm.sessions === 1 ? "sesión" : "sesiones"} en ${frequencyLabel(
            rhythm.weeks,
          )} semanas. ${FREQUENCY_TOOLTIP}`}
        >
          <span
            className={`text-[12.5px] font-semibold tz-nums ${
              rhythm.sessions === 0 ? "text-critical" : "text-brand-text"
            }`}
          >
            {frequencyLabel(rhythm.perWeek)}
            <span className="text-[10.5px] font-medium text-brand-muted"> /sem</span>
          </span>
          {/* La ventana real de ESTE socio, cuando no es la declarada: sin
              esto, «0,0 /sem» de quien se dio de alta el martes se lee igual
              que el de quien lleva dos meses sin aparecer. */}
          {rhythm.weeks < FREQUENCY_WINDOW_WEEKS && (
            <span className="text-[10px] font-semibold text-brand-muted">
              sobre {frequencyLabel(rhythm.weeks)} sem
            </span>
          )}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
      joinedAt: m.joinedAt.toLocaleDateString("es-ES"),
    },
  };
}

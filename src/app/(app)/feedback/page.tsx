import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { PageHeader } from "@/components/ui/page-header";
import { Card, KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import {
  listMemberFeedback,
  listCentersForFeedback,
  computeFeedbackKpis,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  type AlignmentCategory,
  type SortBy,
} from "@/lib/feedback-queries";
import { FilterToolbar, type FilterGroup } from "@/components/ui/filter-toolbar";
import { parseFilterValues } from "@/lib/filter-params";
import { AlignmentTrack } from "./alignment-track";

// El eje «Alineación» es multi-valor: dentro del eje los valores se combinan
// con OR (`?cat=ciego,sin`). `cliente_positivo` no tiene opción propia (ver
// README): no es ni punto ciego ni alineado, y no hay caso de uso para filtrarlo.
const CAT_PARAM_TO_CATEGORY: Record<string, AlignmentCategory> = {
  ciego: "ciego",
  alineado: "alineado",
  sin: "sin_feedback",
};

const CAT_OPTIONS = [
  { value: "ciego", label: "Puntos ciegos" },
  { value: "alineado", label: "Alineados" },
  { value: "sin", label: "Sin feedback" },
];

const SORT_PARAM_TO_SORTBY: Record<string, SortBy> = {
  divergencia: "divergencia",
  satisfaccion: "satisfaccion",
  nombre: "nombre",
};

const SORT_OPTIONS = [
  { value: "divergencia", label: "Mayor divergencia" },
  { value: "satisfaccion", label: "Menor satisfacción" },
  { value: "nombre", label: "Nombre" },
];

// highlightBlindSpots (README "Tweaks"): resalta las filas de punto ciego. Por
// defecto true; no se expone control en la UI (no hay caso de uso para
// desactivarlo en producción), así que queda fijo aquí en vez de vía prop.
const HIGHLIGHT_BLIND_SPOTS = true;

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; centerId?: string; cat?: string; sort?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  // RB-PLAN-003: además del rol, el plan contratado. Sin esto, la URL directa
  // se saltaría el filtro del menú.
  await requireFeature("feedback_direccion");
  const orgId = session.user.orgId;
  const params = await searchParams;

  const selection = {
    centerId: parseFilterValues(params.centerId),
    cat: parseFilterValues(params.cat),
  };
  const sortBy = params.sort ? SORT_PARAM_TO_SORTBY[params.sort] ?? "divergencia" : "divergencia";

  // La query solo aplica búsqueda y orden: centro y alineación se resuelven
  // aquí, sobre el mismo conjunto con el que se calculan los recuentos por
  // opción de cada eje (lo que evita filtrar hasta dejar la lista vacía).
  const [allRows, centers] = await Promise.all([
    listMemberFeedback(orgId, { q: params.q, sortBy }),
    listCentersForFeedback(orgId),
  ]);

  const matches = (row: (typeof allRows)[number], sel: typeof selection) => {
    if (sel.centerId.length && !sel.centerId.includes(row.centerId)) return false;
    if (sel.cat.length && !sel.cat.some((v) => CAT_PARAM_TO_CATEGORY[v] === row.cat)) return false;
    return true;
  };
  const facetCount = (axis: keyof typeof selection, value: string) =>
    allRows.filter((row) => matches(row, { ...selection, [axis]: [value] })).length;

  const rows = allRows.filter((row) => matches(row, selection));
  const kpis = computeFeedbackKpis(rows);

  const filterGroups: FilterGroup[] = [
    {
      name: "centerId",
      label: "Centro",
      width: 268,
      options: centers.map((c) => ({ value: c.id, label: c.name, count: facetCount("centerId", c.id) })),
    },
    {
      name: "cat",
      label: "Alineación",
      width: 252,
      options: CAT_OPTIONS.map((o) => ({ ...o, count: facetCount("cat", o.value) })),
    },
    // El orden no es combinable consigo mismo: es una píldora más, pero de
    // selección única.
    { name: "sort", label: "Orden", width: 244, single: true, options: SORT_OPTIONS },
  ];

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        kicker="Cliente vs. debrief"
        description={
          <span className="flex flex-col gap-1">
            <span>
              {kpis.collected} de {kpis.total} socios con feedback · compara lo que reportan con el debrief de su
              entrenador
            </span>
            <Link href="/feedback/debriefs-semanales" className="text-brand-text-2 font-semibold hover:underline w-fit">
              Ver reporte semanal de debriefs de sesión →
            </Link>
          </span>
        }
        actions={
          <div className="inline-flex items-center gap-4 bg-white border border-brand-border rounded-pill px-4 py-2 text-xs font-semibold text-brand-text-2">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full bg-brand-ink border-2 border-white"
                style={{ boxShadow: "0 0 0 1px #d8ccb8" }}
              />
              Cliente
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-[11px] h-[11px] bg-apta-gold border-2 border-white rotate-45"
                style={{ boxShadow: "0 0 0 1px #cbb98f" }}
              />
              Entrenador
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5">
        <KpiCard label="Feedback del socio" value={`${kpis.collected}/${kpis.total}`} hint={`${kpis.responseRate}% de respuesta`} tone="accent" />
        <KpiCard
          label="Debrief del entrenador"
          value={`${kpis.debriefCollected}/${kpis.total}`}
          hint={`${kpis.debriefResponseRate}% de respuesta`}
          tone={kpis.debriefResponseRate < 100 ? "warning" : "accent"}
        />
        <KpiCard
          label="Satisfacción cliente"
          value={kpis.clientAvgSat != null ? kpis.clientAvgSat.toFixed(1) : "—"}
          hint="media sobre 10"
          tone="accent"
        />
        <KpiCard
          label="Valoración entrenador"
          value={kpis.trainerAvgRating != null ? kpis.trainerAvgRating.toFixed(1) : "—"}
          hint="debrief medio"
          tone="accent"
        />
        <KpiCard
          label="Puntos ciegos"
          value={String(kpis.blindSpots)}
          hint="el entrenador sobrestima"
          tone={kpis.blindSpots > 0 ? "critical" : "default"}
        />
        <KpiCard
          label="Socios en riesgo"
          value={String(kpis.atRisk)}
          hint="requieren seguimiento"
          tone={kpis.atRisk > 0 ? "warning" : "default"}
        />
      </div>

      <FilterToolbar
        groups={filterGroups}
        total={rows.length}
        resultLabel={{ one: "socio", many: "socios" }}
        searchPlaceholder="Buscar por nombre…"
      />

      <Card title="SOCIOS" meta={`${rows.length} socio${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <p className="text-[13px] text-faint text-center py-10">Sin resultados para este filtro.</p>
        ) : (
          <div className="-mx-4 sm:-mx-[22px]">
            {rows.map((r) => {
              const highlighted = HIGHLIGHT_BLIND_SPOTS && r.cat === "ciego";
              return (
                <Link
                  key={r.memberId}
                  href={`/feedback/${r.memberId}`}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 sm:flex-wrap px-4 sm:px-[22px] py-4 border-b border-[#ede7dc] last:border-0 transition-colors duration-150 hover:bg-[#faf8f3] ${
                    highlighted ? "bg-[#fbf1ec]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 sm:[flex:1_1_240px]">
                    <span className="w-10 h-10 rounded-full bg-[#efe8dc] text-[#5c4a34] font-bold text-[13px] inline-flex items-center justify-center shrink-0">
                      {initials(r.firstName, r.lastName)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-brand-text truncate">
                        {r.firstName} {r.lastName}
                      </div>
                      <div className="text-xs text-brand-muted truncate">
                        {r.planName ?? "Sin plan"} · {r.trainerName ?? "Sin entrenador"} · {r.centerName}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:[flex:2_1_300px]">
                    <span className={`text-sm font-bold tabular-nums w-9 text-right ${r.clientAvg != null ? "text-brand-text" : "text-[#c7bfad]"}`}>
                      {r.clientAvg != null ? r.clientAvg.toFixed(1) : "—"}
                    </span>
                    <AlignmentTrack clientValue={r.clientAvg} trainerValue={r.trainerAvg} cat={r.cat} />
                    <span className={`text-sm font-bold tabular-nums w-9 ${r.trainerAvg == null ? "text-[#c7bfad]" : ""}`} style={r.trainerAvg != null ? { color: "#8a6d2f" } : undefined}>
                      {r.trainerAvg != null ? r.trainerAvg.toFixed(1) : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 justify-between sm:justify-end sm:[flex:1_1_200px]">
                    <Badge tone={CATEGORY_TONE[r.cat]}>{CATEGORY_LABEL[r.cat]}</Badge>
                    {r.gap != null && (
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: r.cat === "ciego" ? "#8a3420" : r.cat === "cliente_positivo" ? "#5c4a34" : "#8a8574" }}
                      >
                        {r.gap >= 0 ? "+" : ""}
                        {r.gap.toFixed(1)}
                      </span>
                    )}
                    <span className="text-[#c7bfad] hidden sm:inline">›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

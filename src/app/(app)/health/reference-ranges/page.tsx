import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { listReferenceRanges } from "@/lib/reference-ranges";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import DeleteButton from "./delete-button";
import CreateRangeForm from "./create-range-form";

const METRIC_LABEL: Record<string, string> = {
  bodyFatPct: "% graso",
  bmi: "IMC",
  visceralFatRating: "Grasa visceral",
  bodyWaterPct: "Agua corporal",
};
const SEX_LABEL: Record<string, string> = { M: "Hombre", F: "Mujer" };

export default async function ReferenceRangesPage() {
  const session = await requireRole(["OWNER"]);
  // RB-PLAN-003: además del rol, el plan contratado. Sin esto, la URL directa
  // se saltaría el filtro del menú.
  await requireFeature("salud_aptitud");
  const ranges = await listReferenceRanges(session.user.orgId);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Rangos de referencia de composición corporal (docs/COMPOSICION_CORPORAL_TANITA.md §3). Alimentan el semáforo de la ficha del socio. Si no hay fila para una métrica, se usan los valores por defecto del propio informe Tanita." />

      <CreateRangeForm />

      <DataTable columns={rangeColumns} rows={ranges.map(rangeToRow)} emptyTitle="Sin rangos" />
    </div>
  );
}

type Range = Awaited<ReturnType<typeof listReferenceRanges>>[number];

const rangeColumns: DataTableColumn[] = [
  { key: "metric", header: "Métrica", sortable: true, className: "font-medium text-text-2" },
  { key: "sex", header: "Sexo", sortable: true },
  { key: "age", header: "Edad", sortable: true, className: "text-muted" },
  { key: "range", header: "Rango", sortable: true, className: "tz-nums" },
  { key: "editedBy", header: "Editado por", sortable: true, className: "text-faint text-xs" },
  { key: "actions", header: "" },
];

function rangeToRow(r: Range): DataTableRow {
  return {
    key: r.id,
    sortValues: {
      metric: METRIC_LABEL[r.metric] ?? r.metric,
      sex: r.sex ? SEX_LABEL[r.sex] ?? r.sex : "Ambos",
      age: r.ageMin ?? -1,
      range: r.min ?? -Infinity,
      editedBy: r.updatedAt.getTime(),
    },
    cells: {
      metric: METRIC_LABEL[r.metric] ?? r.metric,
      sex: r.sex ? SEX_LABEL[r.sex] ?? r.sex : "Ambos",
      age: (
        <>
          {r.ageMin ?? "—"}–{r.ageMax ?? "—"}
        </>
      ),
      range: (
        <>
          {r.min ?? "—"} – {r.max ?? "—"}
        </>
      ),
      editedBy: (
        <>
          {r.editedBy?.name} · {r.updatedAt.toLocaleDateString("es-ES")}
        </>
      ),
      actions: <DeleteButton id={r.id} />,
    },
  };
}

import { requireRole } from "@/lib/guard";
import { listReferenceRanges } from "@/lib/reference-ranges";
import { PageHeader } from "@/components/ui/page-header";
import { TableShell, THead, Th, TRow, Td } from "@/components/ui/table";
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
  const ranges = await listReferenceRanges(session.user.orgId);

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Rangos de referencia de composición corporal (docs/COMPOSICION_CORPORAL_TANITA.md §3). Alimentan el semáforo de la ficha del socio. Si no hay fila para una métrica, se usan los valores por defecto del propio informe Tanita." />

      <CreateRangeForm />

      <TableShell>
        <THead>
          <Th>Métrica</Th>
          <Th>Sexo</Th>
          <Th>Edad</Th>
          <Th>Rango</Th>
          <Th>Editado por</Th>
          <Th />
        </THead>
        <tbody>
          {ranges.map((r) => (
            <TRow key={r.id}>
              <Td className="font-medium text-text-2">{METRIC_LABEL[r.metric] ?? r.metric}</Td>
              <Td>{r.sex ? SEX_LABEL[r.sex] ?? r.sex : "Ambos"}</Td>
              <Td className="text-muted">
                {r.ageMin ?? "—"}–{r.ageMax ?? "—"}
              </Td>
              <Td className="tz-nums">
                {r.min ?? "—"} – {r.max ?? "—"}
              </Td>
              <Td className="text-faint text-xs">
                {r.editedBy?.name} · {r.updatedAt.toLocaleDateString("es-ES")}
              </Td>
              <Td>
                <DeleteButton id={r.id} />
              </Td>
            </TRow>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

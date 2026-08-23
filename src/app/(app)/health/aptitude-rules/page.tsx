import type { Prisma } from "@prisma/client";
import { resolveTimezone } from "@/lib/timezone";
import { formatInstantDate } from "@/lib/date-utils";
import { requireRole } from "@/lib/guard";
import { canEditAptitudeRules } from "@/lib/rbac";
import { requireFeature } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import DeleteButton from "./delete-button";
import CreateRuleForm from "./create-rule-form";

const LIGHT_DOT: Record<string, string> = { RED: "bg-critical", AMBER: "bg-warning", GREEN: "bg-good" };
const LIGHT_LABEL: Record<string, string> = { RED: "Evitar", AMBER: "Adaptar", GREEN: "Libre" };

export default async function AptitudeRulesPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  const timeZone = await resolveTimezone();
  // La dirección de centro LEE las reglas (las aplica a diario en su centro);
  // mantenerlas sigue siendo del director de la organización (G.2).
  const canEdit = canEditAptitudeRules(session.user.role);
  // RB-PLAN-003: además del rol, el plan contratado. Sin esto, la URL directa
  // se saltaría el filtro del menú.
  await requireFeature("salud_aptitud");

  const rules = await prisma.aptitudeRule.findMany({
    where: { orgId: session.user.orgId },
    include: { editedBy: { select: { name: true } } },
    orderBy: [{ injuryZone: "asc" }, { light: "desc" }],
  });

  return (
    <div className="tz-page space-y-4">
      <PageHeader description="Reglas deterministas mantenidas por Sergio, no por un modelo de IA (G.2). Cada zona de lesión se traduce en un bloque de trabajo con semáforo y adaptación. El entrenador ve el resultado en el Session Brief; la IA (fuera de esta entrega) solo redactaría, nunca decidiría el color." />

      {canEdit && <CreateRuleForm />}

      <DataTable
        columns={canEdit ? ruleColumns : ruleColumns.filter((c) => c.key !== "actions")}
        rows={rules.map((r) => ruleToRow(r, canEdit, timeZone))}
        emptyTitle="Sin reglas"
      />
    </div>
  );
}

type Rule = Prisma.AptitudeRuleGetPayload<{ include: { editedBy: { select: { name: true } } } }>;

const ruleColumns: DataTableColumn[] = [
  { key: "injuryZone", header: "Zona", sortable: true, className: "font-medium text-text-2" },
  { key: "blockArea", header: "Bloque", sortable: true },
  { key: "light", header: "Semáforo", sortable: true },
  { key: "adaptation", header: "Adaptación", sortable: true, className: "text-muted" },
  { key: "editedBy", header: "Editado por", sortable: true, className: "text-faint text-xs" },
  { key: "actions", header: "" },
];

function ruleToRow(r: Rule, canEdit: boolean, timeZone: string): DataTableRow {
  return {
    key: r.id,
    sortValues: {
      injuryZone: r.injuryZone,
      blockArea: r.blockArea,
      light: r.light,
      adaptation: r.adaptation ?? "",
      editedBy: r.updatedAt.getTime(),
    },
    cells: {
      injuryZone: r.injuryZone,
      blockArea: r.blockArea,
      light: (
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${LIGHT_DOT[r.light]}`} />
          {LIGHT_LABEL[r.light]}
        </span>
      ),
      adaptation: r.adaptation ?? "—",
      editedBy: (
        <>
          {r.editedBy?.name} · {formatInstantDate(r.updatedAt, timeZone)}
        </>
      ),
      actions: canEdit ? <DeleteButton id={r.id} /> : null,
    },
  };
}

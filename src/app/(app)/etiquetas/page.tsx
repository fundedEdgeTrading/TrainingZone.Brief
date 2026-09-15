import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { canManageMembers } from "@/lib/rbac";
import { ensureAutomaticTagDefinitions } from "@/lib/tag-engine";
import { listTagDefinitions, type TagDefinitionView } from "@/lib/tags-queries";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import CreateTagForm from "./create-tag-form";
import { TagRowActions } from "./tag-row-actions";
import { RecalcButton } from "./recalc-button";

/**
 * E14-21 · El catálogo de etiquetas.
 *
 * Dos tablas porque son dos cosas distintas y la distinción es de DATO
 * (`MemberTagDefinition.kind`), no de nombre:
 *
 *  · Las AUTOMÁTICAS las pone y las QUITA el motor del cron. Aquí solo se leen,
 *    con su definición en texto llano al lado: quien mira tiene que poder
 *    entender por qué un socio entró (o no) en un flujo sin abrir el código.
 *  · Las MANUALES son del centro: se crean, se renombran y se desactivan.
 *
 * Y el número que de verdad importa: A CUÁNTOS SOCIOS AFECTA HOY cada una,
 * acotado al ámbito de centro de quien mira. Es el mismo patrón que E3-04 con
 * las reglas de aptitud, y por la misma razón: una regla con 0 socios —o con
 * todos— está mal acotada, y sin este número no se ve de ninguna manera.
 */
export default async function EtiquetasPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  // RB-PLAN-003 / E6-02: además del rol, el plan contratado (`marketing_automatizado`).
  await requireFeature("marketing_automatizado");
  const canEdit = canManageMembers(session.user.role);

  // Autorreparación del catálogo: las nueve automáticas existen siempre y con el
  // rótulo y la definición que dice `tags.ts`, que es su fuente única. Es un
  // upsert idempotente, y sin él una organización que todavía no ha pasado por
  // el cron vería la pantalla vacía y creería que no hay etiquetas.
  await ensureAutomaticTagDefinitions(session.user.orgId);

  const definitions = await listTagDefinitions(session.user);
  const automatic = definitions.filter((d) => d.kind === "AUTOMATIC");
  const manual = definitions.filter((d) => d.kind === "MANUAL");
  const totalTagged = definitions.reduce((sum, d) => sum + d.affectedMembers, 0);

  return (
    <div className="tz-page space-y-6">
      <PageHeader
        description="Un socio tiene varias etiquetas. Las automáticas las pone y las quita el sistema en cada pasada del cron; las manuales las ponéis vosotros desde la ficha. Una automática no se puede quitar a mano: volvería sola en la siguiente pasada. Si necesitáis contradecir al sistema, eso es una etiqueta manual distinta."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-brand-muted tz-nums">
              {totalTagged} {totalTagged === 1 ? "etiqueta puesta" : "etiquetas puestas"} en tus centros
            </span>
            {canEdit && <RecalcButton />}
          </div>
        }
      />

      <section className="space-y-3">
        <SectionTitle
          title="Automáticas"
          subtitle="Las mantiene el motor: se ponen solas y, lo que importa de verdad, se quitan solas."
        />
        <DataTable
          columns={AUTOMATIC_COLUMNS}
          rows={automatic.map(toAutomaticRow)}
          emptyTitle="Sin etiquetas automáticas"
          emptyDescription="El catálogo se siembra solo al entrar aquí o en la primera pasada del cron."
        />
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Manuales"
          subtitle="Las vuestras. Desactivar no borra: una etiqueta borrada se llevaría por delante el histórico de los flujos que la usaron."
        />
        {canEdit && <CreateTagForm />}
        <DataTable
          columns={canEdit ? MANUAL_COLUMNS : MANUAL_COLUMNS.filter((c) => c.key !== "actions")}
          rows={manual.map((d) => toManualRow(d, canEdit))}
          emptyTitle="Sin etiquetas manuales"
          emptyDescription="Crea la primera arriba: Embajador o Lesión activa son los dos ejemplos de salida."
        />
      </section>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">{title}</h2>
      <p className="text-[13px] text-brand-muted mt-1">{subtitle}</p>
    </div>
  );
}

const AUTOMATIC_COLUMNS: DataTableColumn[] = [
  { key: "label", header: "Etiqueta", sortable: true },
  { key: "description", header: "Cuándo se pone", sortable: false, className: "text-muted" },
  { key: "affected", header: "Socios afectados", sortable: true, className: "tz-nums", align: "right" },
];

const MANUAL_COLUMNS: DataTableColumn[] = [
  { key: "label", header: "Etiqueta", sortable: true },
  { key: "state", header: "Estado", sortable: true },
  { key: "affected", header: "Socios afectados", sortable: true, className: "tz-nums", align: "right" },
  { key: "actions", header: "" },
];

/** Una automática sin socios —o con todos— es una regla mal acotada. */
function affectedCell(d: TagDefinitionView) {
  if (d.kind === "AUTOMATIC" && d.affectedMembers === 0) {
    return (
      <span className="text-warning-text font-semibold" title="Ningún socio de tus centros cae hoy en esta regla: revísala antes de montar un flujo encima.">
        0 · revisar
      </span>
    );
  }
  return d.affectedMembers;
}

function toAutomaticRow(d: TagDefinitionView): DataTableRow {
  return {
    key: d.id,
    className: d.affectedMembers === 0 ? "bg-warning-bg" : undefined,
    sortValues: { label: d.label, affected: d.affectedMembers },
    cells: {
      label: (
        <Badge tone={d.tone} dot={false}>
          {d.label}
        </Badge>
      ),
      description: d.description ?? "—",
      affected: affectedCell(d),
    },
  };
}

function toManualRow(d: TagDefinitionView, canEdit: boolean): DataTableRow {
  return {
    key: d.id,
    className: d.active ? undefined : "opacity-60",
    sortValues: { label: d.label, state: d.active ? 1 : 0, affected: d.affectedMembers },
    cells: {
      label: (
        <Badge tone={d.tone} dot={false}>
          {d.label}
        </Badge>
      ),
      state: d.active ? (
        <span className="text-xs text-brand-muted">Activa</span>
      ) : (
        <span className="text-xs text-warning-text" title="Ya no se puede poner a nadie nuevo, pero ni se borra ni se pierde el histórico.">
          Desactivada
        </span>
      ),
      affected: affectedCell(d),
      actions: canEdit ? <TagRowActions id={d.id} label={d.label} active={d.active} /> : null,
    },
  };
}

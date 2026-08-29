import Link from "next/link";
import { resolveTimezone } from "@/lib/timezone";
import { formatInstantDateTime } from "@/lib/date-utils";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { getAuditLogPage, getDistinctAuditActions, type AuditFilters } from "@/lib/audit-queries";
import { FilterToolbar, type FilterGroup } from "@/components/ui/filter-toolbar";
import { parseFilterValues } from "@/lib/filter-params";
import { AuditDateFilter } from "./audit-date-filter";

/**
 * Rótulo de cada acción del registro. El mapa cubría 7 de las 28 acciones que
 * se escriben de verdad, así que el listado mezclaba frases ("Lectura de dato
 * de salud") con claves crudas del código ("TRAINER_PANEL_HEALTH_READ") en la
 * misma columna. Al añadir una acción nueva, añádela también aquí.
 */
const ACTION_LABEL: Record<string, string> = {
  // Salud (Art. 9 RGPD)
  HEALTH_RECORD_READ: "Lectura de dato de salud",
  HEALTH_RECORD_CREATED: "Alta de dato de salud",
  HEALTH_RECORD_CREATED_FROM_ASSESSMENT: "Dato de salud desde una valoración",
  HEALTH_RECORD_RESOLVED: "Dato de salud resuelto", // histórico: hoy lo escribe HEALTH_RECORD_STATUS_CHANGED
  HEALTH_RECORD_STATUS_CHANGED: "Cambio de estado de un dato de salud",
  LEAD_HEALTH_RECORD_READ: "Lectura de dato de salud de un lead",
  LEAD_HEALTH_RECORD_CREATED: "Alta de dato de salud de un lead",
  SESSION_BRIEF_OPENED: "Session Brief abierto",
  TRAINER_PANEL_HEALTH_READ: "Panel del entrenador: lectura de salud",
  MESOCYCLE_AI_INPUT_READ: "Ficha enviada al generador de mesociclos",
  BODY_COMPOSITION_RECORDED: "Toma de composición corporal",
  // Ficha del socio y consentimientos
  MEMBER_UPDATED: "Ficha de socio actualizada",
  MEMBER_SELF_UPDATED_CONTACT: "Socio actualizó su contacto",
  MEMBER_DELETED: "Socio eliminado",
  CONSENT_GRANTED: "Consentimiento otorgado",
  CONSENT_REVOKED: "Consentimiento retirado",
  CONSENT_VERSION_ACCEPTED: "Nueva versión de consentimientos aceptada",
  EMAIL_PREFERENCES_UPDATED: "Preferencias de correo actualizadas",
  // Bonos, suscripciones y cobros
  SUBSCRIPTION_ADDED: "Bono añadido",
  SUBSCRIPTION_SESSIONS_ADJUSTED: "Saldo de bono ajustado a mano",
  SUBSCRIPTION_FROZEN: "Bono congelado",
  SUBSCRIPTION_RESUMED: "Bono reanudado",
  SUBSCRIPTION_PRICE_UPDATED: "Precio del bono actualizado",
  SUBSCRIPTION_CANCELLATION_SCHEDULED: "Baja programada",
  SUBSCRIPTION_CANCELLATION_UNSCHEDULED: "Baja programada cancelada",
  ONE_OFF_PRODUCT_SOLD: "Producto suelto vendido",
  PAYMENT_POSTPONED: "Cobro aplazado",
  PAYMENT_REFUNDED_LOCAL: "Cobro devuelto (registro local)",
  // Feedback
  FEEDBACK_REQUESTED: "Feedback solicitado al socio",
  FEEDBACK_REVIEWED: "Feedback revisado",
  FEEDBACK_FOLLOWUP_SCHEDULED: "Seguimiento de feedback programado",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; from?: string; to?: string; q?: string }>;
}) {
  const session = await requireRole(["OWNER", "PLATFORM_ADMIN"]);
  // RB-PLAN-003: además del rol, el plan contratado. Sin esto, la URL directa
  // se saltaría el filtro del menú.
  await requireFeature("exportaciones");
  const timeZone = await resolveTimezone();

  const params = await searchParams;
  const filters: AuditFilters = {
    page: params.page ? Number(params.page) : 1,
    actions: parseFilterValues(params.action),
    from: params.from,
    to: params.to,
    q: params.q,
  };

  const [{ logs, total, page, totalPages }, actions] = await Promise.all([
    getAuditLogPage(session.user.orgId, filters),
    getDistinctAuditActions(session.user.orgId),
  ]);

  const exportQs = new URLSearchParams();
  if (filters.actions?.length) exportQs.set("action", filters.actions.join(","));
  if (filters.from) exportQs.set("from", filters.from);
  if (filters.to) exportQs.set("to", filters.to);
  if (filters.q) exportQs.set("q", filters.q);

  const actionGroups: FilterGroup[] = [
    {
      name: "action",
      label: "Acción",
      width: 300,
      options: actions.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a })),
    },
  ];

  function pageHref(p: number) {
    const qs = new URLSearchParams(exportQs);
    qs.set("page", String(p));
    return `/audit?${qs.toString()}`;
  }

  return (
    <div className="tz-page space-y-4">
      <PageHeader
        description="Registro append-only (ADR-008). Cada lectura de un dato de salud y cada apertura del Session Brief con indicadores de salud queda registrada aquí, exigible bajo RGPD Art. 9."
        actions={
          <Link
            href={`/api/audit/export?${exportQs.toString()}`}
            className="inline-flex items-center gap-2 bg-white text-brand-text border border-brand-border rounded-[10px] px-4 py-2 text-sm font-semibold hover:bg-tz-bone transition-colors duration-150"
          >
            Exportar CSV →
          </Link>
        }
      />

      <FilterToolbar
        groups={actionGroups}
        total={total}
        resultLabel={{ one: "evento", many: "eventos" }}
        searchPlaceholder="Buscar por actor…"
        extra={<AuditDateFilter />}
        extraAxes={["from", "to"]}
      />

      <DataTable
        columns={auditColumns}
        rows={logs.map((l) => logToRow(l, timeZone))}
        pagination={false}
        emptyTitle="Sin registros"
        emptyDescription="No hay eventos de auditoría para este filtro."
      />

      {logs.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-[13px] text-brand-muted">
          <span>
            {total} evento{total === 1 ? "" : "s"} · página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {/* `scroll={false}`: pasar de página es cambiar el contenido de la
                tabla, no ir a otra pantalla — sin esto la vista saltaba al
                principio en cada clic, igual que hacían los filtros. */}
            {page > 1 && (
              <Link href={pageHref(page - 1)} scroll={false} className="font-semibold text-brand-text hover:underline">
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} scroll={false} className="font-semibold text-brand-text hover:underline">
                Siguiente →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type AuditLog = Awaited<ReturnType<typeof getAuditLogPage>>["logs"][number];

const auditColumns: DataTableColumn[] = [
  { key: "createdAt", header: "Fecha", sortable: true, className: "text-muted tz-nums text-xs" },
  { key: "action", header: "Acción", sortable: true, className: "font-medium text-text-2" },
  { key: "actor", header: "Actor", sortable: true, className: "text-text-2" },
  { key: "entity", header: "Entidad", sortable: true, className: "text-muted text-xs" },
  { key: "member", header: "Socio" },
];

function logToRow(l: AuditLog, timeZone: string): DataTableRow {
  return {
    key: l.id,
    sortValues: {
      createdAt: l.createdAt.getTime(),
      action: ACTION_LABEL[l.action] ?? l.action,
      actor: l.actor?.name ?? "",
      entity: l.entityType,
    },
    cells: {
      createdAt: formatInstantDateTime(l.createdAt, timeZone),
      action: <Badge tone="neutral">{ACTION_LABEL[l.action] ?? l.action}</Badge>,
      actor: (
        <>
          {l.actor?.name ?? "—"} <span className="text-xs text-faint">({l.actor?.role})</span>
        </>
      ),
      entity: (
        <>
          {l.entityType} · {l.entityId.slice(0, 8)}…
        </>
      ),
      member: l.memberId ? (
        <Link href={`/members/${l.memberId}`} className="text-tz-black hover:underline text-xs">
          ver ficha
        </Link>
      ) : (
        "—"
      ),
    },
  };
}

import Link from "next/link";

import { requireRole } from "@/lib/guard";
import { canManageMembers } from "@/lib/rbac";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { buttonClass } from "@/components/ui/button";
import { FLOW_STATUS_HELP, FLOW_STATUS_LABEL, FLOW_TRIGGER_LABEL } from "@/lib/flows/catalog";
import { listFlows, getFlowsModuleState, type FlowListItem } from "@/lib/flows/queries";
import { WEEKLY_CAP_DEFINITION } from "@/lib/flows/safety";
import type { FlowTriggerType } from "@prisma/client";
import { FlowRowActions } from "./flow-row-actions";
import { TestEmailForm } from "./test-email-form";

/**
 * E14-27 · La pantalla de flujos: lista, estado y pausa global.
 *
 * La pausa global la pinta el layout, para que se vea desde CUALQUIER pantalla
 * del módulo y no solo desde aquí.
 *
 * Lo que esta pantalla cuenta de cada flujo es lo que hace falta para decidir
 * si se enciende: en qué estado está, cuánta gente tiene EN COLA ahora mismo y
 * cuántos correos ha mandado de verdad. Un flujo con cien en cola y cero
 * enviados o está recién montado o está mal acotado, y eso se ve sin abrirlo.
 */
export default async function FlujosPage() {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  const canEdit = canManageMembers(session.user.role);

  const [flows, state] = await Promise.all([listFlows(session.user), getFlowsModuleState(session.user)]);
  const activos = flows.filter((f) => f.status === "ACTIVE").length;

  return (
    <>
      <PageHeader
        description={
          <>
            Cuatro piezas y nada más: <strong>disparador → condición → espera → acción</strong>. El motor es una cola,
            no un «enviar ahora»: nada sale entre las 22:00 y las 8:00 del centro, y ningún socio recibe más de{" "}
            <strong>un correo de flujo por semana</strong> entre todos los flujos juntos.
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-brand-muted tz-nums">
              {activos} {activos === 1 ? "flujo activo" : "flujos activos"} de {flows.length}
            </span>
            {canEdit && (
              <Link href="/flujos/nuevo" className={buttonClass({})}>
                Nuevo flujo
              </Link>
            )}
          </div>
        }
      />

      <DataTable
        columns={canEdit ? COLUMNS : COLUMNS.filter((c) => c.key !== "actions")}
        rows={flows.map((f) => toRow(f, canEdit))}
        emptyTitle="Todavía no hay ningún flujo"
        emptyDescription="Monta el primero con «Nuevo flujo». Nace en borrador: se ejecuta de verdad, pero escribe al email de pruebas y no a tus socios."
      />

      {canEdit && <TestEmailForm value={state.testEmail} />}

      <section className="rounded-card border border-brand-border bg-brand-card p-4">
        <h2 className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted">
          Lo que el motor no deja hacer
        </h2>
        <ul className="mt-2 space-y-1.5 text-[13px] text-brand-muted list-disc pl-5">
          <li>
            <strong className="text-brand-ink">Un email por socio y semana</strong>, entre todos los flujos. {WEEKLY_CAP_DEFINITION}
          </li>
          <li>
            <strong className="text-brand-ink">Nada entre las 22:00 y las 8:00</strong>, en la hora del centro. Lo que
            toque de noche se encola para las 8:00: ni se manda ni se pierde.
          </li>
          <li>
            <strong className="text-brand-ink">Un socio no repite el mismo flujo hasta 90 días después.</strong>
          </li>
          <li>
            <strong className="text-brand-ink">Quien no ha dado su consentimiento de marketing no recibe nada</strong>,
            ni siquiera en un ensayo. Cada correo lleva su enlace de baja.
          </li>
        </ul>
        <p className="mt-3 text-[12px] text-brand-muted">
          Estos topes no se pueden aflojar desde ninguna pantalla, a propósito: una regla de seguridad que se afloja con
          un clic deja de serlo.
        </p>
      </section>
    </>
  );
}

const COLUMNS: DataTableColumn[] = [
  { key: "name", header: "Flujo", sortable: true },
  { key: "status", header: "Estado", sortable: true },
  { key: "trigger", header: "Entra cuando", sortable: false, className: "text-muted" },
  { key: "center", header: "Centro", sortable: true },
  { key: "queued", header: "En cola", sortable: true, className: "tz-nums", align: "right" },
  { key: "sent", header: "Enviados", sortable: true, className: "tz-nums", align: "right" },
  { key: "actions", header: "" },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  ACTIVE: "good",
  PAUSED: "warning",
};

const STATUS_RANK: Record<string, number> = { ACTIVE: 0, DRAFT: 1, PAUSED: 2 };

function toRow(flow: FlowListItem, canEdit: boolean): DataTableRow {
  return {
    key: flow.id,
    sortValues: {
      name: flow.name,
      status: STATUS_RANK[flow.status] ?? 9,
      center: flow.centerName,
      queued: flow.queued,
      sent: flow.sent,
    },
    cells: {
      name: (
        <div>
          <Link href={`/flujos/${flow.id}`} className="font-semibold hover:underline">
            {flow.name}
          </Link>
          <div className="text-[12px] text-brand-muted">
            {flow.steps} {flow.steps === 1 ? "paso" : "pasos"} · {flow.entered} han entrado
          </div>
        </div>
      ),
      status: (
        <Badge tone={STATUS_TONE[flow.status] ?? "neutral"} dot={false}>
          <span title={FLOW_STATUS_HELP[flow.status]}>{FLOW_STATUS_LABEL[flow.status]}</span>
        </Badge>
      ),
      trigger: FLOW_TRIGGER_LABEL[flow.triggerType as FlowTriggerType] ?? flow.triggerType,
      center: flow.centerName,
      queued: flow.queued,
      sent: flow.sent,
      actions: canEdit ? <FlowRowActions id={flow.id} status={flow.status} /> : null,
    },
  };
}

import Link from "next/link";
import { notFound } from "next/navigation";

import type { FlowGoalKind } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { requireFeature } from "@/lib/entitlements";
import { canManageMembers } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { FLOW_STATUS_HELP, FLOW_STATUS_LABEL } from "@/lib/flows/catalog";
import { getFlow, getFlowFunnel } from "@/lib/flows/queries";
import { FlowEditor } from "../flow-editor";
import type { FlowEditorValue } from "../editor-value";
import { flowEditorOptions } from "../editor-options";
import { FunnelCard } from "../funnel-card";

/**
 * Un flujo: su embudo arriba y su editor debajo.
 *
 * El PANEL COMPLETO por flujo es de E3 (`/flujos/[id]/panel`), que es quien
 * define qué objetivo mide cada uno de los seis de salida. Lo que hay aquí es
 * el ARMAZÓN: las tres cifras ya construidas, con el hueco del objetivo tipado
 * y dicho en pantalla cuando todavía nadie sabe medirlo.
 */
export default async function FlujoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  // En la página y no solo en el layout: ver la nota de `/flujos/page.tsx`.
  await requireFeature("marketing_automatizado");

  // Fuera de ámbito es 404, no 403: un error que distingue «no existe» de «no
  // es tuyo» cuenta lo que hay en el centro de al lado.
  const flow = await getFlow(session.user, id);
  if (!flow) notFound();

  const [funnel, options] = await Promise.all([getFlowFunnel(session.user, id), flowEditorOptions(session.user)]);

  const initial: FlowEditorValue = {
    name: flow.name,
    description: flow.description ?? "",
    centerId: flow.centerId,
    triggerType: flow.triggerType,
    triggerConfig: (flow.triggerConfig ?? {}) as Record<string, unknown>,
    goalKind: (flow.goalKind ?? "") as FlowGoalKind | "",
    // Solo las condiciones DE ENTRADA se editan aquí: las de paso son una
    // vuelta de tuerca que todavía no necesita nadie, y meterlas en el
    // formulario rompería las cuatro piezas.
    conditions: flow.conditions
      .filter((c) => c.stepId === null)
      .map((c) => ({ type: c.type, config: (c.config ?? {}) as Record<string, unknown>, negated: c.negated })),
    steps: flow.steps.map((s) => ({
      branch: s.branch,
      waitDays: s.waitDays,
      actionType: s.actionType,
      actionConfig: (s.actionConfig ?? {}) as Record<string, unknown>,
      branchAfterDays: s.branchAfterDays,
    })),
  };

  return (
    <>
      <PageHeader
        kicker={flow.name}
        description={
          <>
            {flow.description || "Sin descripción."} · {flow.center.name}
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={flow.status === "ACTIVE" ? "good" : flow.status === "PAUSED" ? "warning" : "neutral"} dot={false}>
              <span title={FLOW_STATUS_HELP[flow.status]}>{FLOW_STATUS_LABEL[flow.status]}</span>
            </Badge>
            <Link href="/flujos" className="text-[13px] underline text-brand-muted hover:text-brand-ink">
              Volver
            </Link>
          </div>
        }
      />

      {funnel && <FunnelCard funnel={funnel} />}

      {canManageMembers(session.user.role) && <FlowEditor options={options} initial={initial} flowId={flow.id} />}
    </>
  );
}

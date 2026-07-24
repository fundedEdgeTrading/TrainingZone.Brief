"use client";

import { Card } from "@/components/kpi-card";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { DistributionChart } from "./lead-distribution-chart";
import { addLeadChannelAction, addNoCloseReasonAction } from "./actions";

/** RB-LEAD-004/011: listas configurables por dirección sin desplegar código. */
export function LeadConfigPanel({
  channelDistribution,
  reasonDistribution,
}: {
  channelDistribution: { label: string; count: number }[];
  reasonDistribution: { label: string; count: number }[];
}) {
  const leadsTotal = channelDistribution.reduce((s, r) => s + r.count, 0);
  const noCerradoTotal = reasonDistribution.reduce((s, r) => s + r.count, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card title="Canales de origen" meta={`${leadsTotal} leads`}>
        <p className="text-xs text-brand-muted -mt-3 mb-4">De dónde llegan los leads</p>
        <DistributionChart rows={channelDistribution} gradient="linear-gradient(90deg,#1d1d1c,#5c4a34)" valueColor="#1d1d1c" />
        <ActionForm action={addLeadChannelAction} successMessage="Canal añadido" className="flex gap-2 mt-4">
          <Input name="label" placeholder="Nuevo canal..." className="flex-1" />
          <Button type="submit" size="sm">
            Añadir
          </Button>
        </ActionForm>
      </Card>
      <Card title="Motivos de no cierre" meta={`${noCerradoTotal} no cerrados`}>
        <p className="text-xs text-brand-muted -mt-3 mb-4">Por qué se pierden</p>
        <DistributionChart rows={reasonDistribution} gradient="linear-gradient(90deg,#8a3420,#c0674a)" valueColor="#8a3420" />
        <ActionForm action={addNoCloseReasonAction} successMessage="Motivo añadido" className="flex gap-2 mt-4">
          <Input name="label" placeholder="Nuevo motivo..." className="flex-1" />
          <Button type="submit" size="sm">
            Añadir
          </Button>
        </ActionForm>
      </Card>
    </div>
  );
}

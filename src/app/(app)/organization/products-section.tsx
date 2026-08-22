import type { MembershipPlan, PlanType } from "@prisma/client";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/ui/data-table";
import { ActionForm } from "@/components/ui/action-form";
import { createMembershipPlan, setMembershipPlanActive } from "./actions";
import { EditPlanDrawer } from "./product-controls";

const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  MONTHLY: "Cuota mensual",
  SESSION_PACK: "Bono de sesiones",
  DROP_IN: "Sesión suelta",
  PERSONAL_TRAINING: "Entrenamiento personal",
  DUO: "Dúo",
  ONLINE: "Online",
};

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const CARD = "bg-brand-card border border-brand-border rounded-card p-5 shadow-card";

export function ProductsSection({ plans }: { plans: MembershipPlan[] }) {
  const active = plans.filter((p) => p.active);
  const archived = plans.filter((p) => !p.active);

  return (
    <section className="space-y-3">
      <h2 className="font-display font-extrabold text-lg uppercase tracking-[-.01em] text-brand-text">
        Productos
      </h2>
      <p className="text-sm text-muted -mt-1">
        Lo que vendes a tus socios: cuotas, bonos de sesiones y entrenamiento personal. Los productos se
        archivan, nunca se borran, para no dejar sin referencia el histórico de cobros.
      </p>

      <div className={CARD}>
        {active.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no tienes productos. Crea el primero para poder cobrar a tus socios.
          </p>
        ) : (
          <DataTable columns={productColumns} rows={active.map(planToRow)} pageSize={10} />
        )}
      </div>

      <div className={CARD}>
        <h3 className="text-sm font-bold text-brand-text mb-3">Nuevo producto</h3>
        <ActionForm
          action={createMembershipPlan}
          successMessage="Producto creado."
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
        >
          <Field label="Nombre">
            <Input name="name" required placeholder="Cuota mensual ilimitada" />
          </Field>
          <Field label="Tipo">
            <Select name="type" defaultValue="MONTHLY">
              {(Object.keys(PLAN_TYPE_LABEL) as PlanType[]).map((t) => (
                <option key={t} value={t}>
                  {PLAN_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Precio (€)">
            <Input name="priceEuros" required inputMode="decimal" placeholder="59,90" />
          </Field>
          <Field label="Sesiones incluidas">
            <Input name="sessionsIncluded" inputMode="numeric" placeholder="Solo bonos" />
          </Field>
          <Field label="Validez (días)">
            <Input name="validityDays" inputMode="numeric" placeholder="Opcional" />
          </Field>
          <div className="lg:col-span-5">
            <Button type="submit">Crear producto</Button>
          </div>
        </ActionForm>
      </div>

      {archived.length > 0 && (
        <div className={CARD}>
          <h3 className="text-sm font-bold text-brand-text mb-3">Archivados</h3>
          <div className="flex flex-wrap gap-2">
            {archived.map((plan) => (
              <div
                key={plan.id}
                className="flex min-w-0 max-w-full flex-wrap items-center gap-2 border border-brand-border rounded-control px-3 py-1.5"
              >
                <span className="min-w-0 max-w-full truncate">
                  <Badge tone="neutral">{plan.name}</Badge>
                </span>
                <span className="text-xs text-muted">{euros(plan.priceCents)}</span>
                <ActionForm action={setMembershipPlanActive} successMessage="Producto reactivado.">
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="active" value="true" />
                  <Button type="submit" variant="ghost" size="sm">
                    Reactivar
                  </Button>
                </ActionForm>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const productColumns: DataTableColumn[] = [
  { key: "name", header: "Producto", sortable: true },
  { key: "type", header: "Tipo", sortable: true },
  { key: "price", header: "Precio", sortable: true },
  { key: "sessions", header: "Sesiones", sortable: true },
  { key: "validity", header: "Validez", sortable: true },
  { key: "actions", header: " ", align: "right" },
];

function planToRow(plan: MembershipPlan): DataTableRow {
  return {
    key: plan.id,
    sortValues: {
      name: plan.name,
      type: PLAN_TYPE_LABEL[plan.type],
      price: plan.priceCents,
      sessions: plan.sessionsIncluded ?? -1,
      validity: plan.validityDays ?? -1,
    },
    cells: {
      name: <span className="font-medium text-brand-text">{plan.name}</span>,
      type: PLAN_TYPE_LABEL[plan.type],
      price: euros(plan.priceCents),
      sessions: plan.sessionsIncluded ?? "—",
      validity: plan.validityDays ? `${plan.validityDays} días` : "—",
      actions: (
        <div className="flex items-center gap-2 justify-end">
          <EditPlanDrawer plan={plan} />
          <ActionForm action={setMembershipPlanActive} successMessage="Producto archivado.">
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="active" value="false" />
            <Button type="submit" variant="ghost" size="sm">
              Archivar
            </Button>
          </ActionForm>
        </div>
      ),
    },
  };
}

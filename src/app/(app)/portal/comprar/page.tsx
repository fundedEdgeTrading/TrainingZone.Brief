import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { PlanType } from "@prisma/client";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { getActiveMembershipPlans } from "@/lib/public-membership-queries";
import { isRecurring } from "@/lib/member-billing";
import { planServiceKind } from "@/lib/members-queries";
import PurchasePlanButton from "./purchase-plan-button";
import ManageBillingButton from "./manage-billing-button";

export const metadata: Metadata = { title: "Comprar / renovar · Training Zone" };

const SERVICE_LABEL: Record<"EP" | "GROUP" | "ONLINE", string> = {
  EP: "Entrenamiento personal",
  GROUP: "Grupos reducidos",
  ONLINE: "Online",
};

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function planPeriodLabel(plan: { type: PlanType; sessionsIncluded: number | null }) {
  if (isRecurring(plan.type)) return "Cuota mensual";
  return plan.sessionsIncluded ? `Bono de ${plan.sessionsIncluded} sesiones` : "Bono";
}

/** F6: autoservicio ya autenticado — comprar/recargar bono y gestionar la suscripción sin pasar por recepción. */
export default async function PortalComprarPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; motivo?: string }>;
}) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const { checkout, motivo } = await searchParams;

  // A diferencia de la landing pública (RB-VENTA-004, gatea el catálogo entero
  // si el gimnasio no puede cobrar), aquí el socio ya es socio: se le enseña
  // el catálogo siempre y es el botón "Comprar" el que degrada con un aviso
  // claro si Stripe no está listo (createMemberCheckout ya lo resuelve).
  const plans = await getActiveMembershipPlans(session.user.orgId);

  return (
    <div className="max-w-[980px] mx-auto flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text">
            Comprar o renovar tu bono
          </h1>
          <p className="text-sm text-brand-text-2 mt-1">Elige un plan y paga online — tu acceso queda listo en minutos.</p>
        </div>
        <ManageBillingButton />
      </div>

      {checkout === "error" && (
        <div className="rounded-control border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical">
          {motivo || "No se ha podido iniciar el pago. Inténtalo de nuevo."}
        </div>
      )}
      {checkout === "success" && (
        <div className="rounded-control border border-good/30 bg-good-bg px-4 py-3 text-sm text-good">
          Pago recibido — en unos segundos tu bono aparecerá activo.
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-3 text-sm text-brand-text-2">
          Has cancelado el pago. Puedes intentarlo de nuevo cuando quieras.
        </div>
      )}

      {plans.length === 0 ? (
        <div className="rounded-control border border-brand-border bg-tz-bone px-4 py-4 text-sm text-brand-text-2">
          No hay planes disponibles ahora mismo — contacta con recepción.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const kind = planServiceKind(plan.type);
            return (
              <div
                key={plan.id}
                className="flex flex-col justify-between gap-4 rounded-card border border-brand-border bg-white p-5"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-base text-brand-text">{plan.name}</span>
                    {kind && (
                      <span className="inline-flex items-center rounded-pill bg-tz-bone px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-brand-muted">
                        {SERVICE_LABEL[kind]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-muted mt-1">{planPeriodLabel(plan)}</p>
                  <p className="font-display font-extrabold text-xl text-brand-text mt-3">{euros(plan.priceCents)}</p>
                </div>
                <PurchasePlanButton planId={plan.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/guard";
import { getMemberForUser, getMemberPaymentHistory } from "@/lib/portal-queries";
import ManageBillingButton from "../manage-billing-button";

export const metadata: Metadata = { title: "Facturas y pagos · Training Zone" };

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/** F6: historial completo de cobros del socio + acceso al Billing Portal de Stripe. */
export default async function PortalFacturasPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const history = await getMemberPaymentHistory(member.id, 50);

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-brand-text">Facturas y pagos</h1>
          <p className="text-sm text-brand-text-2 mt-1">Gestiona tu método de pago y consulta todos tus cobros.</p>
        </div>
        <ManageBillingButton />
      </div>

      <div className="bg-white border border-brand-border rounded-2xl p-[22px]">
        {history.length === 0 ? (
          <p className="text-sm text-brand-muted">Todavía no hay pagos registrados.</p>
        ) : (
          <div className="flex flex-col">
            {history.map((h, i) => (
              <div
                key={h.id}
                className={`flex items-center justify-between gap-3 py-[11px] text-[13px] ${
                  i < history.length - 1 ? "border-b border-tz-sand" : ""
                }`}
              >
                <span className="text-brand-text">{h.concept}</span>
                <span className="text-brand-muted">
                  {h.date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })} · {euros(h.amountCents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { listPayments, getBillingKpis, getDelinquentMembers, getMembersForPaymentForm } from "@/lib/billing-queries";
import { centerScopeFor } from "@/lib/center-scope";
import { listActivePlansForOrg } from "@/lib/members-queries";
import { isStripeConfiguredForOrg } from "@/lib/stripe";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_TONE } from "@/lib/chart-colors";
import { KpiCard, Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import PaymentForm from "./payment-form";
import StripeCheckoutForm from "./stripe-checkout-form";
import { PostponePaymentAction, RefundPaymentAction } from "./payment-lifecycle-forms";
import { BillingStatusFilter } from "./billing-status-filter";
import { parseFilterValues } from "@/lib/filter-params";
import type { PaymentStatus } from "@prisma/client";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL: Record<string, string> = { PAID: "Pagado", PENDING: "Pendiente", FAILED: "Fallido", REFUNDED: "Devuelto" };
const PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PENDING", "FAILED", "REFUNDED"];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  const params = await searchParams;

  // Mismo ámbito de centro que `/members` (center-scope.ts): dirección de
  // organización ve toda la empresa; recepción/dirección de centro, solo los
  // socios de los centros a los que está imputada. Antes de esto, Cobros
  // filtraba únicamente por organización.
  const scope = await centerScopeFor(session.user);
  const centerIds = scope ?? undefined;

  const [kpis, payments, delinquent, membersForForm, plans, stripeConfigured] = await Promise.all([
    getBillingKpis(session.user.orgId, centerIds),
    listPayments(session.user.orgId, { statuses: parseFilterValues(params.status) as PaymentStatus[], centerIds }),
    getDelinquentMembers(session.user.orgId, centerIds),
    getMembersForPaymentForm(session.user.orgId, centerIds),
    listActivePlansForOrg(session.user.orgId),
    isStripeConfiguredForOrg(session.user.orgId),
  ]);

  return (
    <div className="tz-page space-y-6">
      <PageHeader description="Cero dudas sobre quién está al corriente (F3). Facturación certificada (VERI*FACTU) y pasarela de pago online quedan fuera de esta entrega — aquí solo se registra el cobro." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Cobrado este mes" value={euros(kpis.paidThisMonthCents)} tone="good" delay={0.04} />
        <KpiCard label="Pagos pendientes" value={String(kpis.pending)} tone={kpis.pending ? "warning" : "default"} delay={0.1} />
        <KpiCard label="Pagos fallidos" value={String(kpis.failed)} tone={kpis.failed ? "critical" : "default"} delay={0.16} />
        <KpiCard label="Socios morosos" value={String(kpis.delinquentMembers)} tone={kpis.delinquentMembers ? "critical" : "default"} delay={0.22} />
      </div>

      <Card title="Cobro por Stripe" meta="RB-PAGO-001 — canal objetivo" delay={0.1}>
        <StripeCheckoutForm members={membersForForm} plans={plans} configured={stripeConfigured} />
      </Card>

      <Card title="Registrar cobro manual" meta="efectivo / tarjeta presencial / Bizum — puente hasta Stripe" delay={0.12}>
        <PaymentForm members={membersForForm} />
      </Card>

      {delinquent.length > 0 && (
        <Card title="Socios morosos" meta={String(delinquent.length)} delay={0.18}>
          <div className="sm:overflow-x-auto">
            <table className="tz-stack-table w-full text-sm">
              <thead className="text-xs text-faint text-left">
                <tr>
                  <th className="pb-2">Socio</th>
                  <th className="pb-2">Centro</th>
                  <th className="pb-2">Plan</th>
                  <th className="pb-2">Último pago</th>
                </tr>
              </thead>
              <tbody>
                {delinquent.map((m) => (
                  <tr key={m.id} className="border-t border-tz-sand">
                    <td data-label="" className="py-2 font-semibold">
                      <Link href={`/members/${m.id}`} className="text-tz-black hover:underline">
                        {m.firstName} {m.lastName}
                      </Link>
                    </td>
                    <td data-label="Centro" className="py-2 text-text-2">{m.primaryCenter.name}</td>
                    <td data-label="Plan" className="py-2 text-text-2">{m.subscriptions[0]?.plan.name ?? "—"}</td>
                    <td data-label="Último pago" className="py-2">
                      {m.payments[0] ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge tone={PAYMENT_STATUS_TONE[m.payments[0].status]}>{STATUS_LABEL[m.payments[0].status]}</Badge>
                          <span className="text-muted tz-nums">{m.payments[0].date.toLocaleDateString("es-ES")}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="Pagos recientes"
        delay={0.24}
        action={
          <BillingStatusFilter
            options={PAYMENT_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
              tone: PAYMENT_STATUS_TONE[s],
            }))}
          />
        }
      >
        <div className="sm:overflow-x-auto">
          <table className="tz-stack-table w-full text-sm">
            <thead className="text-xs text-faint text-left">
              <tr>
                <th className="pb-2">Fecha</th>
                <th className="pb-2">Socio</th>
                <th className="pb-2">Importe</th>
                <th className="pb-2">Método</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2">Recibo</th>
                <th className="pb-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-tz-sand">
                  <td data-label="Fecha" className="py-2 tz-nums">
                    {p.date.toLocaleDateString("es-ES")}
                    {p.status === "PENDING" && p.dueDate && (
                      <div className="text-[11px] text-faint">aplazado a {p.dueDate.toLocaleDateString("es-ES")}</div>
                    )}
                  </td>
                  <td data-label="Socio" className="py-2">
                    <Link href={`/members/${p.member.id}`} className="text-tz-black hover:underline">
                      {p.member.firstName} {p.member.lastName}
                    </Link>
                  </td>
                  <td data-label="Importe" className="py-2 tz-nums font-semibold">{euros(p.amountCents)}</td>
                  <td data-label="Método" className="py-2">{PAYMENT_METHOD_LABEL[p.method]}</td>
                  <td data-label="Estado" className="py-2">
                    <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td data-label="Recibo" className="py-2 text-faint">{p.receiptNumber}</td>
                  <td data-label="Acciones" className="py-2 empty:hidden">
                    {p.status === "PENDING" && <PostponePaymentAction paymentId={p.id} />}
                    {p.status === "PAID" && <RefundPaymentAction paymentId={p.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

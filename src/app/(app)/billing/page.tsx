import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { listPayments, getBillingKpis, getDelinquentMembers, getMembersForPaymentForm } from "@/lib/billing-queries";
import { listActivePlansForOrg } from "@/lib/members-queries";
import { isStripeConfigured } from "@/lib/stripe";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_TONE } from "@/lib/chart-colors";
import { KpiCard, Card } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import PaymentForm from "./payment-form";
import StripeCheckoutForm from "./stripe-checkout-form";
import { PostponePaymentAction, RefundPaymentAction } from "./payment-lifecycle-forms";
import type { PaymentStatus } from "@prisma/client";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL: Record<string, string> = { PAID: "Pagado", PENDING: "Pendiente", FAILED: "Fallido", REFUNDED: "Devuelto" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  const params = await searchParams;

  const [kpis, payments, delinquent, membersForForm, plans] = await Promise.all([
    getBillingKpis(session.user.orgId),
    listPayments(session.user.orgId, { status: (params.status as PaymentStatus) || undefined }),
    getDelinquentMembers(session.user.orgId),
    getMembersForPaymentForm(session.user.orgId),
    listActivePlansForOrg(session.user.orgId),
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
        <StripeCheckoutForm members={membersForForm} plans={plans} configured={isStripeConfigured()} />
      </Card>

      <Card title="Registrar cobro manual" meta="efectivo / tarjeta presencial / Bizum — puente hasta Stripe" delay={0.12}>
        <PaymentForm members={membersForForm} />
      </Card>

      {delinquent.length > 0 && (
        <Card title="Socios morosos" meta={String(delinquent.length)} delay={0.18}>
          <table className="w-full text-sm">
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
                  <td className="py-2">
                    <Link href={`/members/${m.id}`} className="text-tz-black hover:underline">
                      {m.firstName} {m.lastName}
                    </Link>
                  </td>
                  <td className="py-2 text-text-2">{m.primaryCenter.name}</td>
                  <td className="py-2 text-text-2">{m.subscriptions[0]?.plan.name ?? "—"}</td>
                  <td className="py-2">
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
        </Card>
      )}

      <Card
        title="Pagos recientes"
        delay={0.24}
        action={
          <div className="flex gap-1 text-xs">
            {["", "PAID", "PENDING", "FAILED"].map((s) => (
              <Link
                key={s}
                href={s ? `/billing?status=${s}` : "/billing"}
                className={`px-2 py-1 rounded-md transition-colors duration-150 ${
                  (params.status ?? "") === s ? "bg-tz-sand text-tz-black font-semibold" : "text-muted hover:bg-tz-sand"
                }`}
              >
                {s ? STATUS_LABEL[s] : "Todos"}
              </Link>
            ))}
          </div>
        }
      >
        <table className="w-full text-sm">
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
                <td className="py-2 tz-nums">
                  {p.date.toLocaleDateString("es-ES")}
                  {p.status === "PENDING" && p.dueDate && (
                    <div className="text-[11px] text-faint">aplazado a {p.dueDate.toLocaleDateString("es-ES")}</div>
                  )}
                </td>
                <td className="py-2">
                  <Link href={`/members/${p.member.id}`} className="text-tz-black hover:underline">
                    {p.member.firstName} {p.member.lastName}
                  </Link>
                </td>
                <td className="py-2 tz-nums font-semibold">{euros(p.amountCents)}</td>
                <td className="py-2">{PAYMENT_METHOD_LABEL[p.method]}</td>
                <td className="py-2">
                  <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
                <td className="py-2 text-faint">{p.receiptNumber}</td>
                <td className="py-2">
                  {p.status === "PENDING" && <PostponePaymentAction paymentId={p.id} />}
                  {p.status === "PAID" && <RefundPaymentAction paymentId={p.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

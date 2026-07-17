import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { listPayments, getBillingKpis, getDelinquentMembers, getMembersForPaymentForm } from "@/lib/billing-queries";
import { PAYMENT_METHOD_LABEL } from "@/lib/chart-colors";
import { KpiCard, Card } from "@/components/kpi-card";
import PaymentForm from "./payment-form";
import type { PaymentStatus } from "@prisma/client";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL: Record<string, string> = { PAID: "Pagado", PENDING: "Pendiente", FAILED: "Fallido", REFUNDED: "Devuelto" };
const STATUS_CLASS: Record<string, string> = {
  PAID: "text-emerald-700",
  PENDING: "text-amber-700",
  FAILED: "text-red-700",
  REFUNDED: "text-slate-500",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
  const params = await searchParams;

  const [kpis, payments, delinquent, membersForForm] = await Promise.all([
    getBillingKpis(session.user.orgId),
    listPayments(session.user.orgId, { status: (params.status as PaymentStatus) || undefined }),
    getDelinquentMembers(session.user.orgId),
    getMembersForPaymentForm(session.user.orgId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cobros</h1>
        <p className="text-sm text-slate-500">
          Cero dudas sobre quién está al corriente (F3). Facturación certificada
          (VERI*FACTU) y pasarela de pago online quedan fuera de esta entrega —
          aquí solo se registra el cobro.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Cobrado este mes" value={euros(kpis.paidThisMonthCents)} tone="good" />
        <KpiCard label="Pagos pendientes" value={String(kpis.pending)} tone={kpis.pending ? "warning" : "default"} />
        <KpiCard label="Pagos fallidos" value={String(kpis.failed)} tone={kpis.failed ? "critical" : "default"} />
        <KpiCard label="Socios morosos" value={String(kpis.delinquentMembers)} tone={kpis.delinquentMembers ? "critical" : "default"} />
      </div>

      <Card title="Registrar cobro manual (efectivo / tarjeta presencial / Bizum)">
        <PaymentForm members={membersForForm} />
      </Card>

      {delinquent.length > 0 && (
        <Card title={`Socios morosos (${delinquent.length})`}>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 text-left">
              <tr>
                <th className="pb-2">Socio</th>
                <th className="pb-2">Centro</th>
                <th className="pb-2">Plan</th>
                <th className="pb-2">Último pago</th>
              </tr>
            </thead>
            <tbody>
              {delinquent.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="py-2">
                    <Link href={`/members/${m.id}`} className="text-indigo-700 hover:underline">
                      {m.firstName} {m.lastName}
                    </Link>
                  </td>
                  <td className="py-2 text-slate-600">{m.primaryCenter.name}</td>
                  <td className="py-2 text-slate-600">{m.subscriptions[0]?.plan.name ?? "—"}</td>
                  <td className="py-2">
                    {m.payments[0] ? (
                      <span className={STATUS_CLASS[m.payments[0].status]}>
                        {STATUS_LABEL[m.payments[0].status]} · {m.payments[0].date.toLocaleDateString("es-ES")}
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
        action={
          <div className="flex gap-1 text-xs">
            {["", "PAID", "PENDING", "FAILED"].map((s) => (
              <Link
                key={s}
                href={s ? `/billing?status=${s}` : "/billing"}
                className={`px-2 py-1 rounded-md ${
                  (params.status ?? "") === s ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {s ? STATUS_LABEL[s] : "Todos"}
              </Link>
            ))}
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400 text-left">
            <tr>
              <th className="pb-2">Fecha</th>
              <th className="pb-2">Socio</th>
              <th className="pb-2">Importe</th>
              <th className="pb-2">Método</th>
              <th className="pb-2">Estado</th>
              <th className="pb-2">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2">{p.date.toLocaleDateString("es-ES")}</td>
                <td className="py-2">
                  <Link href={`/members/${p.member.id}`} className="text-indigo-700 hover:underline">
                    {p.member.firstName} {p.member.lastName}
                  </Link>
                </td>
                <td className="py-2">{euros(p.amountCents)}</td>
                <td className="py-2">{PAYMENT_METHOD_LABEL[p.method]}</td>
                <td className="py-2">
                  <span className={STATUS_CLASS[p.status]}>{STATUS_LABEL[p.status]}</span>
                </td>
                <td className="py-2 text-slate-400">{p.receiptNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
